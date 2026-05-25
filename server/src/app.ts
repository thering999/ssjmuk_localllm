import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { keysRouter } from './routes/keys.js';
import { modelsRouter } from './routes/models.js';
import { fallbackRouter } from './routes/fallback.js';
import { analyticsRouter } from './routes/analytics.js';
import { settingsRouter } from './routes/settings.js';
import { proxyRouter } from './routes/proxy.js';
import { authRouter, verifyToken } from './routes/auth.js';
import { publicRouter } from './routes/public.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  // Basic security and CORS
  const allowedCorsOrigins = new Set(['*']);
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').forEach(o => allowedCorsOrigins.add(o.trim()));
  }

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  
  app.use(cors({
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      callback(null, !origin || allowedCorsOrigins.has(origin));
    },
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Auth middleware for admin routes
  const adminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (verifyToken(token)) {
      next();
    } else {
      res.status(401).json({ error: 'Unauthorized admin access' });
    }
  };

  // API routes
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/keys', adminAuth, keysRouter);
  app.use('/api/models', modelsRouter);
  app.use('/api/fallback', adminAuth, fallbackRouter);
  app.use('/api/analytics', adminAuth, analyticsRouter);
  app.use('/api/settings', adminAuth, settingsRouter);

  // OpenAI proxy route (v1)
  app.use('/v1', proxyRouter);

  // Serve client dist in production
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));

  // Fallback to index.html for non-API routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/v1/')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  return app;
}
