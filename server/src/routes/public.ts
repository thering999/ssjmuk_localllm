import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb, getUnifiedApiKey } from '../db/index.js';

export const publicRouter = Router();

// Get the unified API key (needed for playground)
publicRouter.get('/api-key', (_req: Request, res: Response) => {
  res.json({ apiKey: getUnifiedApiKey() });
});

// Get only enabled models for the playground dropdown
publicRouter.get('/models', (_req: Request, res: Response) => {
  const db = getDb();
  const models = db.prepare(`
    SELECT m.id as modelDbId, m.platform, m.model_id as modelId, m.display_name as displayName, m.size_label as sizeLabel,
           (SELECT COUNT(*) FROM api_keys k WHERE k.platform = m.platform AND k.enabled = 1 AND k.status != 'invalid') as keyCount
    FROM models m
    JOIN fallback_config fc ON m.id = fc.model_db_id
    WHERE m.enabled = 1 AND fc.enabled = 1 AND m.is_embedding = 0
    ORDER BY fc.priority ASC
  `).all();
  res.json(models);
});
