import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';

interface AccessPayload {
  sub: string;
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies AccessPayload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl,
  });
}

/** Verifies an access token and returns the user id, or throws. */
export function verifyAccessToken(token: string): string {
  const decoded = jwt.verify(token, config.jwt.accessSecret);
  if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
    throw new Error('Invalid token payload');
  }
  return decoded.sub;
}

/** Opaque refresh token; stored only as a hash in the database. */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
