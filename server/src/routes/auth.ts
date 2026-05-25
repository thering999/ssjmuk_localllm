import crypto from 'crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { verifyAdminPassword, getSessionSecret } from '../db/index.js';

export const authRouter = Router();

// Create a session token (simple signed hash)
function createToken() {
  const secret = getSessionSecret();
  const timestamp = Date.now().toString();
  const signature = crypto.createHmac('sha256', secret).update(timestamp).digest('hex');
  return `${timestamp}.${signature}`;
}

// Verify a session token
export function verifyToken(token: string): boolean {
  if (!token) return false;
  const [timestamp, signature] = token.split('.');
  if (!timestamp || !signature) return false;

  const secret = getSessionSecret();
  const expectedSignature = crypto.createHmac('sha256', secret).update(timestamp).digest('hex');
  
  if (signature !== expectedSignature) return false;

  // Optional: check expiration (e.g., 24 hours)
  const ts = parseInt(timestamp);
  if (isNaN(ts) || Date.now() - ts > 24 * 60 * 60 * 1000) return false;

  return true;
}

authRouter.post('/login', (req: Request, res: Response) => {
  const { password } = req.body;
  if (verifyAdminPassword(password)) {
    const token = createToken();
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

authRouter.get('/verify', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  
  if (verifyToken(token)) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});
