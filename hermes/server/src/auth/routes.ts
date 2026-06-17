import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthResponse } from '@hermes/shared';
import { prisma } from '../db';
import { config } from '../config';
import { asyncHandler, badRequest, unauthorized } from '../errors';
import { provisionDefaults } from '../users/provision';
import { toApiUser } from '../users/profile';
import { hashPassword, verifyPassword } from './password';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from './jwt';
import { getUserId, requireAuth } from './middleware';

const REFRESH_COOKIE = 'hermes_refresh';
const REFRESH_PATH = '/api/auth';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: REFRESH_PATH,
    maxAge: config.jwt.refreshTtl * 1000,
  });
}

async function issueRefreshToken(userId: string): Promise<string> {
  const token = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + config.jwt.refreshTtl * 1000),
    },
  });
  return token;
}

export const authRouter: Router = Router();

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw badRequest('Email already registered', 'email_taken');
    }
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password),
        name: input.name ?? null,
        ...provisionDefaults(),
      },
    });
    setRefreshCookie(res, await issueRefreshToken(user.id));
    const body: AuthResponse = { user: toApiUser(user), token: signAccessToken(user.id) };
    res.status(201).json(body);
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
      throw unauthorized('Invalid email or password');
    }
    setRefreshCookie(res, await issueRefreshToken(user.id));
    const body: AuthResponse = { user: toApiUser(user), token: signAccessToken(user.id) };
    res.json(body);
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) {
      throw unauthorized('No refresh token');
    }
    const record = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(token) },
    });
    if (!record || record.expiresAt < new Date()) {
      if (record) {
        await prisma.refreshToken.delete({ where: { id: record.id } });
      }
      throw unauthorized('Invalid refresh token');
    }
    // Rotate: a refresh token is single-use.
    await prisma.refreshToken.delete({ where: { id: record.id } });
    setRefreshCookie(res, await issueRefreshToken(record.userId));
    res.json({ token: signAccessToken(record.userId) });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (token) {
      await prisma.refreshToken.deleteMany({ where: { tokenHash: hashRefreshToken(token) } });
    }
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: getUserId(req) } });
    if (!user) {
      throw unauthorized();
    }
    res.json(toApiUser(user));
  }),
);
