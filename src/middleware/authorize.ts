import { Request, Response, NextFunction } from 'express';
import { Role } from '../types';

// Middleware that checks if the user's role is in the allowed list
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ error: 'Forbidden: insufficient permissions' });
      return;
    }

    next();
  };
}
