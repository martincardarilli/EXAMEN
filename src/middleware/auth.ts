import { Request, Response, NextFunction } from 'express';
import { User, Role } from '../types';
import logger from '../logger';

// In a real app, this would decode and verify a JWT token.
// For this exercise, we simulate it by reading from headers.

const VALID_ROLES: Role[] = ['admin', 'doctor', 'patient'];

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;

  if (!userId || !userRole) {
    logger.warn('Auth rejected: missing headers', { ip: req.ip });
    res.status(401).json({ error: 'Missing authentication headers' });
    return;
  }

  if (!VALID_ROLES.includes(userRole as Role)) {
    logger.warn('Auth rejected: invalid role', { role: userRole, ip: req.ip });
    res.status(401).json({ error: 'Invalid role' });
    return;
  }

  const user: User = {
    id: userId,
    role: userRole as Role,
  };

  logger.info('User authenticated', { userId: user.id, role: user.role });

  // Attach user to request so routes can access it
  (req as any).user = user;
  next();
}
