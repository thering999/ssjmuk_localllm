import crypto from 'crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ChatMessage } from '@freellmapi/shared/types.js';
import { routeRequest, routeEmbedding, recordRateLimitHit, recordSuccess, type RouteResult } from '../services/router.js';
import { recordRequest, recordTokens, setCooldown, recordLatency } from '../services/ratelimit.js';
import { getDb, getUnifiedApiKey } from '../db/index.js';

export const proxyRouter = Router();

// Virtual "auto" model. Clients like Hermes require a non-empty `model` field
// on every request, but freellmapi's whole point is to pick the model itself.
// Requesting this id means "let the router decide" — identical to omitting
// `model` entirely.
const AUTO_MODEL_ID = 'auto';

function isAutoModel(modelId: string | undefined): boolean {
  return modelId === AUTO_MODEL_ID;
}

// Constant-time string comparison for the unified API key. Plain `===` leaks
// length and per-character timing, which a network attacker could in principle
// use to recover the key one byte at a time.
function timingSafeStringEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Compare against a same-length buffer regardless of input length so the
  // comparison itself runs in constant time; the explicit length check at the
  // end is what actually decides equality when lengths differ.
  const compareA = a.length === b.length ? a : Buffer.alloc(b.length);
  return crypto.timingSafeEqual(compareA, b) && a.length === b.length;
}

// Sticky sessions: track which model served each "session"
// Key: hash of first user message → model_db_id
// This prevents model switching mid-conversation which causes hallucination
const stickySessionMap = new Map<string, { modelDbId: number; lastUsed: number }>();
const STICKY_TTL_MS = 30 * 60 * 1000; // 30 min session TTL

function getSessionKey(messages: ChatMessage[]): string {
  // Use the first user message as session identifier — clients like Hermes
  // re-send the full conversation each turn, so the first user message is
  // stable across turns. Hash the FULL message (not a 100-char slice) so
  // distinct conversations with identical openings don't collide.
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser || typeof firstUser.content !== 'string') return '';
  const hash = crypto.createHash('sha1').update(firstUser.content).digest('hex');
  return `${hash}:${messages.length > 2 ? 'multi' : 'single'}`;
}

function getStickyModel(messages: ChatMessage[]): number | undefined {
  // Only apply sticky for multi-turn (has assistant messages = continuation)
  const hasAssistant = messages.some(m => m.role === 'assistant');
  if (!hasAssistant) return undefined;

  const key = getSessionKey(messages);
  if (!key) return undefined;

  const entry = stickySessionMap.get(key);
  if (!entry) return undefined;

  if (Date.now() - entry.lastUsed > STICKY_TTL_MS) {
    stickySessionMap.delete(key);
    return undefined;
  }
  return entry.modelDbId;
}

function setStickyModel(messages: ChatMessage[], modelDbId: number) {
  const key = getSessionKey(messages);
  if (!key) return;
  stickySessionMap.set(key, { modelDbId, lastUsed: Date.now() });

  // Cleanup old entries
  if (stickySessionMap.size > 500) {
    const now = Date.now();
    for (const [k, v] of stickySessionMap) {
      if (now - v.lastUsed > STICKY_TTL_MS) stickySessionMap.delete(k);
    }
  }
}

// OpenAI-compatible /models endpoint (used by Hermes for metadata)
proxyRouter.get('/models', (_req: Request, res: Response) => {
  const db = getDb();
  const models = db.prepare('SELECT platform, model_id, display_name, context_window FROM models WHERE enabled = 1 ORDER BY intelligence_rank').all() as any[];
  res.json({
    object: 'list',
    data: [
      {
        id: AUTO_MODEL_ID,
        object: 'model',
        created: 0,
        owned_by: 'freellmapi',
        name: 'Auto (router picks the best available model)',
        context_window: null,
      },
      ...models.map(m => ({
        id: m.model_id,
        object: 'model',
        created: 0,
        owned_by: m.platform,
        name: m.display_name,
        context_window: m.context_window,
      })),
    ],
  });
});

// OpenAI-compatible /embeddings endpoint
proxyRouter.post('/embeddings', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Missing or malformed Authorization header' } });
  }

  const providedKey = authHeader.slice(7);
  const expectedKey = getUnifiedApiKey();
  if (!timingSafeStringEqual(providedKey, expectedKey)) {
    return res.status(401).json({ error: { message: 'Invalid API key' } });
  }

  const body = req.body;
  const requestedModel = isAutoModel(body.model) ? undefined : body.model;
  const input = body.input;

  if (!input) {
    return res.status(400).json({ error: { message: "Missing required 'input' field" } });
  }

  const skipKeys = new Set<string>();
  let lastError: Error | null = null;

  // Max 5 attempts for embeddings (usually less needed as they are simpler)
  for (let attempt = 0; attempt < 5; attempt++) {
    let route: RouteResult;
    try {
      route = routeEmbedding(requestedModel, skipKeys);
    } catch (err: any) {
      return res.status(err.status || 500).json({ error: { message: err.message } });
    }

    const startTime = Date.now();
    try {
      const result = await route.provider.embeddings(route.apiKey, input, route.modelId);
      const latency = Date.now() - startTime;

      // Log success
      recordSuccess(route.modelDbId);
      recordRequest(route.platform, route.modelId, route.keyId);
      recordLatency(route.platform, route.modelId, route.keyId, latency);
      logRequest(route.platform, route.modelId, 'success', 0, 0, latency, null);

      return res.json(result);
    } catch (err: any) {
      lastError = err;
      const latency = Date.now() - startTime;

      // Log failure
      logRequest(route.platform, route.modelId, 'error', 0, 0, latency, err.message);

      if (err.message.includes('rate limit') || err.message.includes('429')) {
        recordRateLimitHit(route.modelDbId);
        setCooldown(route.platform, route.modelId, route.keyId);
        skipKeys.add(`${route.platform}:${route.modelId}:${route.keyId}`);
        continue;
      }

      // Other errors might be permanent for this key/model, skip it
      skipKeys.add(`${route.platform}:${route.modelId}:${route.keyId}`);
    }
  }

  res.status(500).json({ error: { message: lastError?.message || 'Failed to process embedding request after multiple attempts' } });
});

const MAX_RETRIES = 20;

const toolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal('function'),
  function: z.object({
    name: z.string().min(1),
    arguments: z.string(),
  }),
  thought_signature: z.string().optional(),
});

const contentPartSchema = z.union([
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('image_url'),
    image_url: z.object({
      url: z.string(),
      detail: z.enum(['auto', 'low', 'high']).optional(),
    }),
  }),
  z.object({
    type: z.literal('file'),
    file: z.object({
      name: z.string(),
      mimeType: z.string(),
      data: z.string(),
    }),
  }),
]);

const systemMessageSchema = z.object({
  role: z.literal('system'),
  content: z.union([z.string(), z.array(contentPartSchema)]),
  name: z.string().optional(),
});

const userMessageSchema = z.object({
  role: z.literal('user'),
  content: z.union([z.string(), z.array(contentPartSchema)]),
  name: z.string().optional(),
});

const assistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.union([z.string(), z.array(contentPartSchema)]).nullable().optional(),
  name: z.string().optional(),
  tool_calls: z.array(toolCallSchema).optional(),
}).refine((msg) => {
  const hasContent = msg.content != null && (typeof msg.content === 'string' ? msg.content.length > 0 : msg.content.length > 0);
  const hasToolCalls = (msg.tool_calls?.length ?? 0) > 0;
  return hasContent || hasToolCalls;
}, {
  message: 'assistant messages must include non-empty content or tool_calls',
});

const toolMessageSchema = z.object({
  role: z.literal('tool'),
  content: z.union([z.string(), z.array(contentPartSchema)]),
  tool_call_id: z.string().min(1),
  name: z.string().optional(),
});

const toolDefinitionSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    strict: z.boolean().optional(),
  }),
});

const toolChoiceSchema = z.union([
  z.enum(['none', 'auto', 'required']),
  z.object({
    type: z.literal('function'),
    function: z.object({
      name: z.string().min(1),
    }),
  }),
]);

const chatCompletionSchema = z.object({
  messages: z.array(z.union([
    systemMessageSchema,
    userMessageSchema,
    assistantMessageSchema,
    toolMessageSchema,
  ])).min(1),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),
  stream: z.boolean().optional(),
  tools: z.array(toolDefinitionSchema).optional(),
  tool_choice: toolChoiceSchema.optional(),
  parallel_tool_calls: z.boolean().optional(),
});

function isRetryableError(err: any): boolean {
  const msg = (err.message ?? '').toLowerCase();
  return msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')
    || msg.includes('quota') || msg.includes('resource_exhausted')
    || msg.includes('aborted') || msg.includes('timeout') || msg.includes('etimedout')
    || msg.includes('econnrefused') || msg.includes('econnreset')
    || msg.includes('503') || msg.includes('unavailable')
    || msg.includes('500') || msg.includes('internal server error');
}

proxyRouter.post('/chat/completions', async (req: Request, res: Response) => {
  const start = Date.now();

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const unifiedKey = getUnifiedApiKey();
  if (!token || !timingSafeStringEqual(token, unifiedKey)) {
    res.status(401).json({
      error: { message: 'Invalid API key', type: 'authentication_error' },
    });
    return;
  }

  // Validate request
  const parsed = chatCompletionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        message: `Invalid request: ${parsed.error.errors.map(e => e.message).join(', ')}`,
        type: 'invalid_request_error',
      },
    });
    return;
  }

  const { model: requestedModel, temperature, max_tokens, top_p, stream, tools, tool_choice, parallel_tool_calls } = parsed.data;
  const messages: ChatMessage[] = parsed.data.messages.map((m): ChatMessage => {
    if (m.role === 'assistant') {
      return {
        role: 'assistant',
        content: m.content ?? null,
        ...(m.name ? { name: m.name } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls.map(tc => ({
          id: tc.id,
          type: tc.type,
          function: tc.function,
          thought_signature: tc.thought_signature,
        })) } : {}),
      };
    }

    if (m.role === 'tool') {
      return {
        role: 'tool',
        content: m.content as any,
        tool_call_id: m.tool_call_id,
        ...(m.name ? { name: m.name } : {}),
      };
    }

    return {
      role: m.role as any,
      content: m.content as any,
      ...(m.name ? { name: m.name } : {}),
    };
  });

  // --- Smart Context Trimming ---
  // Keep system messages + last 10 messages to save tokens and speed up response
  const systemMessages = messages.filter(m => m.role === 'system');
  const otherMessages = messages.filter(m => m.role !== 'system');
  const trimmedMessages = [
    ...systemMessages,
    ...otherMessages.slice(-10)
  ];

  const hasImages = trimmedMessages.some(m =>
    Array.isArray(m.content) && m.content.some(p => p.type === 'image_url' || p.type === 'file')
  );

  // --- Tiny Task Detection ---
  const lastUserMsg = [...trimmedMessages].reverse().find(m => m.role === 'user');
  const isTinyTask = !hasImages && lastUserMsg && typeof lastUserMsg.content === 'string' && lastUserMsg.content.length < 50;

  // --- Fast Semantic Cache Check ---
  let cacheKey = '';
  if (!stream && !hasImages && lastUserMsg && typeof lastUserMsg.content === 'string') {
    cacheKey = crypto.createHash('sha256').update(JSON.stringify(trimmedMessages)).digest('hex');
    const db = getDb();
    const cached = db.prepare('SELECT response_json FROM semantic_cache WHERE query_hash = ?').get(cacheKey) as { response_json: string } | undefined;

    if (cached) {
      const result = JSON.parse(cached.response_json);
      result._cached = true;
      res.setHeader('X-Cache-Hit', 'true');
      return res.json(result);
    }
  }

  const estimatedInputTokens = trimmedMessages.reduce((sum, m) => {
    if (typeof m.content !== 'string') return sum;
    return sum + Math.ceil(m.content.length / 4);
  }, 0);
  const estimatedTotal = estimatedInputTokens + (max_tokens ?? 1000);

  let preferredModel: number | undefined;
  if (isAutoModel(requestedModel)) {
    preferredModel = getStickyModel(trimmedMessages);
  } else if (requestedModel) {
    const db = getDb();
    const enabled = db.prepare('SELECT id FROM models WHERE model_id = ? AND enabled = 1').get(requestedModel) as { id: number } | undefined;
    if (enabled) {
      preferredModel = enabled.id;
    } else {
      const disabled = db.prepare('SELECT id FROM models WHERE model_id = ?').get(requestedModel) as { id: number } | undefined;
      const reason = disabled ? 'is disabled' : 'is not in the catalog';
      res.status(400).json({
        error: {
          message: `Model '${requestedModel}' ${reason}. Use 'auto' (or omit the 'model' field) to auto-route.`,
          type: 'invalid_request_error',
          code: 'model_not_found',
        },
      });
      return;
    }
  } else {
    preferredModel = getStickyModel(trimmedMessages);
  }

  const skipKeys = new Set<string>();
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let route: RouteResult;
    try {
      route = routeRequest(estimatedTotal, skipKeys.size > 0 ? skipKeys : undefined, preferredModel, hasImages, isTinyTask);
    } catch (err: any) {
      if (lastError) {
        res.status(429).json({
          error: { message: `All models rate-limited. Last error: ${lastError.message}`, type: 'rate_limit_error' },
        });
      } else {
        res.status(err.status ?? 503).json({
          error: { message: err.message, type: 'routing_error' },
        });
      }
      return;
    }

    recordRequest(route.platform, route.modelId, route.keyId);

    try {
      if (stream) {
        let totalOutputTokens = 0;
        let streamStarted = false;
        try {
          const gen = route.provider.streamChatCompletion(
            route.apiKey, trimmedMessages, route.modelId,
            { temperature, max_tokens, top_p, tools, tool_choice, parallel_tool_calls },
          );

          for await (const chunk of gen) {
            if (!streamStarted) {
              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Connection', 'keep-alive');
              res.setHeader('X-Routed-Via', `${route.platform}/${route.modelId}`);
              if (attempt > 0) res.setHeader('X-Fallback-Attempts', String(attempt));
              streamStarted = true;
            }
            const text = chunk.choices[0]?.delta?.content ?? '';
            totalOutputTokens += Math.ceil(text.length / 4);
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }

          if (!streamStarted) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('X-Routed-Via', `${route.platform}/${route.modelId}`);
          }
          res.write('data: [DONE]\n\n');
          res.end();

          const latency = Date.now() - start;
          recordTokens(route.platform, route.modelId, route.keyId, estimatedInputTokens + totalOutputTokens);
          recordSuccess(route.modelDbId);
          recordLatency(route.platform, route.modelId, route.keyId, latency);
          setStickyModel(trimmedMessages, route.modelDbId);
          logRequest(route.platform, route.modelId, 'success', estimatedInputTokens, totalOutputTokens, latency, null);
          return;
        } catch (streamErr: any) {
          if (streamStarted) {
            console.error(`[Proxy] Mid-stream error from ${route.displayName}:`, streamErr.message);
            const payload = { error: { message: `Provider error (${route.displayName}): stream interrupted`, type: 'stream_error' } };
            try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch { }
            try { res.write('data: [DONE]\n\n'); res.end(); } catch { }
            logRequest(route.platform, route.modelId, 'error', estimatedInputTokens, totalOutputTokens, Date.now() - start, streamErr.message);
            return;
          }
          throw streamErr;
        }
      } else {
        const result = await route.provider.chatCompletion(
          route.apiKey, trimmedMessages, route.modelId,
          { temperature, max_tokens, top_p, tools, tool_choice, parallel_tool_calls },
        );

        const latency = Date.now() - start;
        const totalTokens = result.usage?.total_tokens ?? 0;
        recordTokens(route.platform, route.modelId, route.keyId, totalTokens);
        recordSuccess(route.modelDbId);
        recordLatency(route.platform, route.modelId, route.keyId, latency);
        setStickyModel(trimmedMessages, route.modelDbId);

        res.setHeader('X-Routed-Via', `${route.platform}/${route.modelId}`);
        if (attempt > 0) res.setHeader('X-Fallback-Attempts', String(attempt));
        res.json(result);

        if (cacheKey) {
          try {
            const db = getDb();
            db.prepare('INSERT OR IGNORE INTO semantic_cache (query_hash, query_text, response_json, model_id, platform) VALUES (?, ?, ?, ?, ?)')
              .run(cacheKey, typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '', JSON.stringify(result), route.modelId, route.platform);
          } catch (cacheErr) {
            console.error('Failed to save to cache:', cacheErr);
          }
        }

        logRequest(route.platform, route.modelId, 'success', result.usage?.prompt_tokens ?? 0, result.usage?.completion_tokens ?? 0, latency, null);
        return;
      }
    } catch (err: any) {
      const latency = Date.now() - start;
      logRequest(route.platform, route.modelId, 'error', estimatedInputTokens, 0, latency, err.message);

      if (isRetryableError(err)) {
        const skipId = `${route.platform}:${route.modelId}:${route.keyId}`;
        skipKeys.add(skipId);
        setCooldown(route.platform, route.modelId, route.keyId, 120_000);
        recordRateLimitHit(route.modelDbId);
        lastError = err;
        console.log(`[Proxy] ${err.message.slice(0, 60)} from ${route.displayName}, falling back (attempt ${attempt + 1}/${MAX_RETRIES})`);
        continue;
      }

      res.status(502).json({
        error: { message: `Provider error (${route.displayName}): ${err.message}`, type: 'provider_error' },
      });
      return;
    }
  }

  res.status(429).json({
    error: { message: `All models rate-limited after ${MAX_RETRIES} attempts. Last: ${lastError?.message}`, type: 'rate_limit_error' },
  });
});

function logRequest(
  platform: string,
  modelId: string,
  status: string,
  inputTokens: number,
  outputTokens: number,
  latencyMs: number,
  error: string | null,
) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO requests (platform, model_id, status, input_tokens, output_tokens, latency_ms, error)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(platform, modelId, status, inputTokens, outputTokens, latencyMs, error);
  } catch (e) {
    console.error('Failed to log request:', e);
  }
}
