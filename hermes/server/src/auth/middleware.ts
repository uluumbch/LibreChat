import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../errors';
import { prisma } from '../db';
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

/** Gate a route to workspace admins. Runs after `requireAuth`. */
export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: getUserId(req) },
      select: { role: true },
    });
    if (user?.role !== 'ADMIN') {
      next(forbidden('Admin access required'));
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
