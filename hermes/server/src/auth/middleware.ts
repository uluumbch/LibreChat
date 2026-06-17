import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../errors';
import { verifyAccessToken } from './jwt';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized());
    return;
  }
  try {
    req.userId = verifyAccessToken(header.slice('Bearer '.length));
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}

/** Returns the authenticated user id; throws if `requireAuth` did not run. */
export function getUserId(req: Request): string {
  if (!req.userId) {
    throw unauthorized();
  }
  return req.userId;
}
