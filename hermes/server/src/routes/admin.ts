import { Router } from 'express';
import { z } from 'zod';
import type { User as DbUser } from '@prisma/client';
import type {
  AdminActivityEvent,
  AdminJob,
  AdminOverview,
  AdminUser,
  AdminUserDetail,
  AdminUserToolset,
  SkillOption,
  UsagePoint,
} from '@hermes/shared';
import { prisma } from '../db';
import { config } from '../config';
import { asyncHandler, badRequest, notFound } from '../errors';
import { requireAdmin, requireAuth } from '../auth/middleware';
import { gatewayPool } from '../hermes/pool';
import { requireParam } from '../http';
import { toCreditBalance } from '../users/profile';
import { provisionDefaults } from '../users/provision';
import { JOB_NAME_RE, toJobSummary, userJobPrefix, userJobTag } from '../jobs/scope';

const LOW_CREDIT_RATIO = 0.15;
const CHART_DAYS = 14;
const ACTIVITY_LIMIT = 8;

function gateway() {
  return gatewayPool.resolve(config.defaultModel);
}

function toAdminUser(user: DbUser, conversationCount: number): AdminUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    role: user.role,
    status: user.status as AdminUser['status'],
    model: user.model ?? config.defaultModel,
    credits: toCreditBalance(user),
    toolsetCount: user.enabledToolsets.length,
    conversationCount,
    createdAt: user.createdAt.toISOString(),
  };
}

function isLowOnCredits(user: DbUser): boolean {
  const remaining = user.creditsPurchased - user.creditsUsed;
  if (remaining <= 0) {
    return true;
  }
  return user.creditsPurchased > 0 && remaining / user.creditsPurchased < LOW_CREDIT_RATIO;
}

/** Conversation counts keyed by user id, in a single grouped query. */
async function conversationCounts(): Promise<Map<string, number>> {
  const groups = await prisma.conversation.groupBy({
    by: ['userId'],
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.userId, g._count._all]));
}

const dayLabel = (d: Date): string =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const adminRouter: Router = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    const counts = await conversationCounts();

    const since = new Date(Date.now() - CHART_DAYS * 24 * 60 * 60 * 1000);
    const recentMessages = await prisma.message.findMany({
      where: { role: 'assistant', createdAt: { gte: since } },
      select: { createdAt: true },
    });

    const buckets = new Map<string, number>();
    const chart: UsagePoint[] = [];
    for (let i = CHART_DAYS - 1; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const label = dayLabel(day);
      buckets.set(label, 0);
      chart.push({ label, count: 0 });
    }
    for (const message of recentMessages) {
      const label = dayLabel(message.createdAt);
      if (buckets.has(label)) {
        buckets.set(label, (buckets.get(label) ?? 0) + 1);
      }
    }
    for (const point of chart) {
      point.count = buckets.get(point.label) ?? 0;
    }

    const activityRows = await prisma.message.findMany({
      where: { role: 'assistant' },
      orderBy: { createdAt: 'desc' },
      take: ACTIVITY_LIMIT,
      select: {
        id: true,
        conversationId: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        conversation: { select: { title: true } },
      },
    });
    const activity: AdminActivityEvent[] = activityRows.map((row) => ({
      id: row.id,
      userId: row.user.id,
      userName: row.user.name ?? row.user.email,
      action: `replied in “${row.conversation.title}”`,
      conversationId: row.conversationId,
      createdAt: row.createdAt.toISOString(),
    }));

    const alerts = users
      .filter(isLowOnCredits)
      .sort((a, b) => a.creditsPurchased - a.creditsUsed - (b.creditsPurchased - b.creditsUsed))
      .map((user) => toAdminUser(user, counts.get(user.id) ?? 0));

    const overview: AdminOverview = {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.status === 'ACTIVE').length,
      needsAttention: alerts.length,
      creditsSold: users.reduce((sum, u) => sum + u.creditsPurchased, 0),
      creditsRemaining: users.reduce((sum, u) => sum + Math.max(0, u.creditsPurchased - u.creditsUsed), 0),
      creditsUsed: users.reduce((sum, u) => sum + u.creditsUsed, 0),
      chart,
      alerts,
      activity,
    };
    res.json(overview);
  }),
);

adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const search = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;
    const users = await prisma.user.findMany({ where, orderBy: { createdAt: 'asc' } });
    const counts = await conversationCounts();
    res.json({ items: users.map((user) => toAdminUser(user, counts.get(user.id) ?? 0)) });
  }),
);

async function userToolsets(user: DbUser): Promise<AdminUserToolset[]> {
  const enabled = new Set(user.enabledToolsets);
  try {
    const { data } = await gateway().client.listToolsets();
    return data.map((toolset) => ({
      name: toolset.name,
      label: toolset.label,
      description: toolset.description,
      enabled: enabled.has(toolset.name),
    }));
  } catch {
    return user.enabledToolsets.map((name) => ({ name, label: name, enabled: true }));
  }
}

async function userSkills(): Promise<SkillOption[]> {
  try {
    const { data } = await gateway().client.listSkills();
    return data.map((skill) => ({
      name: skill.name,
      description: skill.description,
      category: skill.category,
    }));
  } catch {
    return [];
  }
}

async function userJobs(userId: string): Promise<AdminUserDetail['jobs']> {
  const prefix = userJobPrefix(userId);
  try {
    const { jobs } = await gateway().client.listJobs();
    return jobs
      .filter((job) => (job.name ?? '').startsWith(prefix))
      .map((job) => toJobSummary(job, prefix));
  } catch {
    return [];
  }
}

adminRouter.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw notFound('User not found');
    }
    const [count, toolsets, skills, jobs] = await Promise.all([
      prisma.conversation.count({ where: { userId: id } }),
      userToolsets(user),
      userSkills(),
      userJobs(id),
    ]);
    const detail: AdminUserDetail = {
      ...toAdminUser(user, count),
      instructions: user.instructions ?? null,
      memoryEnabled: user.memoryEnabled,
      toolsets,
      skills,
      jobs,
    };
    res.json(detail);
  }),
);

const updateBody = z.object({
  model: z.string().max(120).optional(),
  instructions: z.string().max(8000).nullable().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  enabledToolsets: z.array(z.string().max(80)).max(64).optional(),
});

adminRouter.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const input = updateBody.parse(req.body);
    if (input.model && !gatewayPool.forModel(input.model)) {
      throw badRequest(`Unknown model: ${input.model}`, 'unknown_model');
    }
    const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw notFound('User not found');
    }
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.enabledToolsets !== undefined ? { enabledToolsets: input.enabledToolsets } : {}),
      },
    });
    const count = await prisma.conversation.count({ where: { userId: id } });
    res.json(toAdminUser(user, count));
  }),
);

const topupBody = z.object({ amount: z.number().int().positive().max(1_000_000) });

adminRouter.post(
  '/users/:id/topup',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const { amount } = topupBody.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw notFound('User not found');
    }
    const user = await prisma.user.update({
      where: { id },
      data: { creditsPurchased: { increment: amount }, lastTopupAt: new Date() },
    });
    const count = await prisma.conversation.count({ where: { userId: id } });
    res.json(toAdminUser(user, count));
  }),
);

const inviteBody = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  startingCredits: z.number().int().min(0).max(1_000_000).optional(),
});

adminRouter.post(
  '/invite',
  asyncHandler(async (req, res) => {
    const input = inviteBody.parse(req.body);
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw badRequest('Email already registered', 'email_taken');
    }
    const user = await prisma.user.create({
      data: {
        email,
        name: input.name ?? null,
        ...provisionDefaults(input.startingCredits),
        ...(input.startingCredits !== undefined ? { lastTopupAt: new Date() } : {}),
      },
    });
    res.status(201).json(toAdminUser(user, 0));
  }),
);

adminRouter.get(
  '/jobs',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
    const byTag = new Map(users.map((user) => [userJobTag(user.id), user]));
    const { jobs } = await gateway().client.listJobs();
    const items: AdminJob[] = [];
    for (const job of jobs) {
      const match = JOB_NAME_RE.exec(job.name ?? '');
      if (!match) {
        continue;
      }
      const owner = byTag.get(match[1]!);
      if (!owner) {
        continue;
      }
      items.push({
        ...toJobSummary(job, userJobPrefix(owner.id)),
        ownerId: owner.id,
        ownerName: owner.name ?? owner.email,
        ownerEmail: owner.email,
      });
    }
    res.json({ items });
  }),
);

adminRouter.post(
  '/jobs/:id/:action',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const action = requireParam(req, 'action');
    if (action !== 'pause' && action !== 'resume' && action !== 'run') {
      throw notFound('Unknown job action');
    }
    const resp = await gateway().client.getJob(id).catch(() => null);
    if (!resp?.job) {
      throw notFound('Job not found');
    }
    await gateway().client.jobAction(id, action);
    const updated = await gateway().client.getJob(id).catch(() => null);
    const job = updated?.job ?? resp.job;
    const match = JOB_NAME_RE.exec(job.name ?? '');
    const users = match
      ? await prisma.user.findMany({ select: { id: true, name: true, email: true } })
      : [];
    const owner = match ? users.find((u) => userJobTag(u.id) === match[1]) : undefined;
    res.json({
      ...toJobSummary(job, owner ? userJobPrefix(owner.id) : ''),
      ownerId: owner?.id ?? '',
      ownerName: owner?.name ?? owner?.email ?? 'Unknown',
      ownerEmail: owner?.email ?? '',
    });
  }),
);
