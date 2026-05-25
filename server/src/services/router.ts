import { getDb } from '../db/index.js';
import { getProvider } from '../providers/index.js';
import { decrypt } from '../lib/crypto.js';
import { canMakeRequest, canUseTokens, isOnCooldown, getAverageLatency } from './ratelimit.js';
import type { BaseProvider } from '../providers/base.js';

interface ModelRow {
  id: number;
  platform: string;
  model_id: string;
  display_name: string;
  rpm_limit: number | null;
  rpd_limit: number | null;
  tpm_limit: number | null;
  tpd_limit: number | null;
  is_embedding: number;
  supports_vision: number;
}

interface KeyRow {
  id: number;
  platform: string;
  encrypted_key: string;
  iv: string;
  auth_tag: string;
  status: string;
  enabled: number;
}

interface FallbackRow {
  model_db_id: number;
  priority: number;
  enabled: number;
}

export interface RouteResult {
  provider: BaseProvider;
  modelId: string;
  modelDbId: number;
  apiKey: string;
  keyId: number;
  platform: string;
  displayName: string;
}

// Round-robin index per platform (kept for embeddings for now)
const roundRobinIndex = new Map<string, number>();

// ── Dynamic priority: track 429s per model and demote accordingly ──
// Key: model_db_id → { count, lastHit, penalty }
const rateLimitPenalties = new Map<number, { count: number; lastHit: number; penalty: number }>();

// Penalty decays over time so models recover
const PENALTY_PER_429 = 3;        // each 429 adds this many priority positions
const MAX_PENALTY = 10;            // cap so a model doesn't sink forever
const DECAY_INTERVAL_MS = 2 * 60 * 1000; // penalty decays every 2 minutes
const DECAY_AMOUNT = 1;            // remove this much penalty per decay interval

/**
 * Record a 429 for a model — increases its penalty so it sinks in priority.
 */
export function recordRateLimitHit(modelDbId: number) {
  const existing = rateLimitPenalties.get(modelDbId);
  const now = Date.now();
  if (existing) {
    existing.count++;
    existing.lastHit = now;
    existing.penalty = Math.min(existing.penalty + PENALTY_PER_429, MAX_PENALTY);
  } else {
    rateLimitPenalties.set(modelDbId, { count: 1, lastHit: now, penalty: PENALTY_PER_429 });
  }
}

/**
 * Record a success for a model — reduces its penalty so it rises back up.
 */
export function recordSuccess(modelDbId: number) {
  const existing = rateLimitPenalties.get(modelDbId);
  if (existing) {
    existing.penalty = Math.max(0, existing.penalty - 1);
    if (existing.penalty === 0) {
      rateLimitPenalties.delete(modelDbId);
    }
  }
}

/**
 * Get the current penalty for a model (with time-based decay).
 */
function getPenalty(modelDbId: number): number {
  const entry = rateLimitPenalties.get(modelDbId);
  if (!entry) return 0;

  // Apply time-based decay
  const now = Date.now();
  const elapsed = now - entry.lastHit;
  const decaySteps = Math.floor(elapsed / DECAY_INTERVAL_MS);
  if (decaySteps > 0) {
    entry.penalty = Math.max(0, entry.penalty - (decaySteps * DECAY_AMOUNT));
    entry.lastHit = now; // reset so we don't double-decay
    if (entry.penalty === 0) {
      rateLimitPenalties.delete(modelDbId);
      return 0;
    }
  }

  return entry.penalty;
}

/**
 * Get current penalties for all models (for the API/dashboard).
 */
export function getAllPenalties(): Array<{ modelDbId: number; count: number; penalty: number }> {
  const result: Array<{ modelDbId: number; count: number; penalty: number }> = [];
  for (const [modelDbId, entry] of rateLimitPenalties) {
    const penalty = getPenalty(modelDbId);
    if (penalty > 0) {
      result.push({ modelDbId, count: entry.count, penalty });
    }
  }
  return result.sort((a, b) => b.penalty - a.penalty);
}

/**
 * Route an embedding request.
 * For embeddings, we usually want a specific model.
 * If no model is specified, we pick the first available embedding model.
 */
export function routeEmbedding(requestedModel?: string, skipKeys?: Set<string>): RouteResult {
  const db = getDb();

  // Find all available embedding models
  let query = 'SELECT * FROM models WHERE is_embedding = 1 AND enabled = 1';
  const params: any[] = [];
  
  if (requestedModel) {
    query += ' AND model_id = ?';
    params.push(requestedModel);
  }

  const models = db.prepare(query).all(...params) as ModelRow[];

  if (models.length === 0) {
    if (requestedModel) {
      throw new Error(`Embedding model '${requestedModel}' not found or not enabled.`);
    } else {
      throw new Error('No embedding models found. Please enable at least one.');
    }
  }

  // Try each model until one works
  for (const model of models) {
    const provider = getProvider(model.platform as any);
    if (!provider) continue;

    const keys = db.prepare(
      'SELECT * FROM api_keys WHERE platform = ? AND enabled = 1 AND status != ?'
    ).all(model.platform, 'invalid') as KeyRow[];

    if (keys.length === 0) continue;

    const limits = {
      rpm: model.rpm_limit,
      rpd: model.rpd_limit,
      tpm: model.tpm_limit,
      tpd: model.tpd_limit,
    };

    const rrKey = `emb:${model.platform}:${model.model_id}`;
    let idx = roundRobinIndex.get(rrKey) ?? 0;

    for (let attempt = 0; attempt < keys.length; attempt++) {
      const key = keys[idx % keys.length];
      idx++;

      const skipId = `${model.platform}:${model.model_id}:${key.id}`;
      if (skipKeys?.has(skipId)) continue;

      if (isOnCooldown(model.platform, model.model_id, key.id)) continue;
      if (!canMakeRequest(model.platform, model.model_id, key.id, limits)) continue;
      
      roundRobinIndex.set(rrKey, idx);
      const decryptedKey = decrypt(key.encrypted_key, key.iv, key.auth_tag);

      return {
        provider,
        modelId: model.model_id,
        modelDbId: model.id,
        apiKey: decryptedKey,
        keyId: key.id,
        platform: model.platform,
        displayName: model.display_name,
      };
    }
  }

  const err = new Error('All embedding models exhausted or rate-limited.') as any;
  err.status = 429;
  throw err;
}

/**
 * Route a request to the best available model.
 * Models are sorted by (base_priority + rate_limit_penalty) so frequently
 * rate-limited models automatically sink below working ones.
 *
 * If preferredModelDbId is set, that model gets tried FIRST (sticky sessions).
 * This prevents hallucination from model switching mid-conversation.
 *
 * @param estimatedTokens - estimated total tokens for rate limit check
 * @param skipKeys - set of "platform:modelId:keyId" to skip (failed on this request)
 * @param preferredModelDbId - try this model first (sticky session)
 * @param requireVision - if true, only models that support vision will be considered
 * @param isTinyTask - if true, prioritize extremely fast/small models
 */
export function routeRequest(
  estimatedTokens = 1000, 
  skipKeys?: Set<string>, 
  preferredModelDbId?: number,
  requireVision = false,
  isTinyTask = false
): RouteResult {
  const db = getDb();

  // Get fallback chain ordered by priority
  const fallbackChain = db.prepare(`
    SELECT fc.model_db_id, fc.priority, fc.enabled
    FROM fallback_config fc
    ORDER BY fc.priority ASC
  `).all() as FallbackRow[];

  // Apply dynamic penalties: sort by (base priority + penalty)
  const sortedChain = fallbackChain.map(entry => ({
    ...entry,
    effectivePriority: entry.priority + getPenalty(entry.model_db_id),
  })).sort((a, b) => a.effectivePriority - b.effectivePriority);

  // If tiny task, try to find a tiny model and move it to the front
  if (isTinyTask && !requireVision) {
    const tinyModelIdx = sortedChain.findIndex(entry => {
      const m = db.prepare("SELECT size_label FROM models WHERE id = ?").get(entry.model_db_id) as { size_label: string };
      return m?.size_label === 'Small';
    });
    if (tinyModelIdx > 0) {
      const [tiny] = sortedChain.splice(tinyModelIdx, 1);
      sortedChain.unshift(tiny);
    }
  }

  // Sticky session: move preferred model to front of chain (unless tiny task overrides it)
  if (preferredModelDbId && !isTinyTask) {
    const idx = sortedChain.findIndex(e => e.model_db_id === preferredModelDbId);
    if (idx > 0) {
      const [preferred] = sortedChain.splice(idx, 1);
      sortedChain.unshift(preferred);
    }
  }

  for (const entry of sortedChain) {
    if (!entry.enabled) continue;

    // Get model details
    let query = 'SELECT * FROM models WHERE id = ? AND enabled = 1';
    const params: any[] = [entry.model_db_id];
    
    if (requireVision) {
      query += ' AND supports_vision = 1';
    }

    const model = db.prepare(query).get(...params) as ModelRow | undefined;
    if (!model) continue;

    const provider = getProvider(model.platform as any);
    if (!provider) continue;

    const keys = db.prepare(
      'SELECT * FROM api_keys WHERE platform = ? AND enabled = 1 AND status != ?'
    ).all(model.platform, 'invalid') as KeyRow[];

    if (keys.length === 0) continue;

    const limits = {
      rpm: model.rpm_limit,
      rpd: model.rpd_limit,
      tpm: model.tpm_limit,
      tpd: model.tpd_limit,
    };

    // --- Dynamic Latency Routing ---
    // Instead of simple round-robin, sort keys by average latency (fastest first)
    const sortedKeys = keys
      .map(k => ({ 
        ...k, 
        avgLatency: getAverageLatency(model.platform, model.model_id, k.id) 
      }))
      .sort((a, b) => {
        // Unknown latency (0) comes first to give new keys a chance
        if (a.avgLatency === 0 && b.avgLatency === 0) return 0;
        if (a.avgLatency === 0) return -1;
        if (b.avgLatency === 0) return 1;
        return a.avgLatency - b.avgLatency;
      });

    for (const key of sortedKeys) {
      const skipId = `${model.platform}:${model.model_id}:${key.id}`;
      if (skipKeys?.has(skipId)) continue;

      if (isOnCooldown(model.platform, model.model_id, key.id)) continue;

      if (!canMakeRequest(model.platform, model.model_id, key.id, limits)) continue;
      if (!canUseTokens(model.platform, model.model_id, key.id, estimatedTokens, limits)) continue;

      const decryptedKey = decrypt(key.encrypted_key, key.iv, key.auth_tag);

      return {
        provider,
        modelId: model.model_id,
        modelDbId: model.id,
        apiKey: decryptedKey,
        keyId: key.id,
        platform: model.platform,
        displayName: model.display_name,
      };
    }
  }

  const err = new Error(requireVision ? 'No available models supporting vision. Please add Gemini API keys.' : 'All models exhausted. Add more API keys or wait for rate limits to reset.') as any;
  err.status = 429;
  throw err;
}
