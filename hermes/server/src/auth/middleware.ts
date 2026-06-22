import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db';
import { forbidden, unauthorized } from '../errors';
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

/** Gate a route to admins. Must run after `requireAuth`; resolves the role from the DB. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  prisma.user
    .findUnique({ where: { id: getUserId(req) }, select: { role: true } })
    .then((user) => {
      next(user?.role === 'ADMIN' ? undefined : forbidden('Admin only'));
    })
    .catch(next);
}

/** Returns the authenticated user id; throws if `requireAuth` did not run. */
export function getUserId(req: Request): string {
  if (!req.userId) {
    throw unauthorized();
  }
  return req.userId;
}
