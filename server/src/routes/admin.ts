import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, User as DbUser } from '@prisma/client';
import type {
  AdminActivityEvent,
  AdminAnalytics,
  AdminJob,
  AdminOverview,
  AdminSlashCommand,
  AdminUser,
  AdminUserCommand,
  AdminUserDetail,
  AdminUserToolset,
  AdminUserModel,
  AdminComposioToolkit,
  AdminLlmModel,
  AdminLlmProvider,
  ComposioToolkit,
  LlmProviderKind,
  ServerActionKey,
  SkillOption,
} from '@hermes/shared';
import { SERVER_ACTION_KEYS, LLM_PROVIDER_KINDS } from '@hermes/shared';
import { prisma } from '../db';
import { config } from '../config';
import { logger } from '../logger';
import { asyncHandler, badRequest, notFound } from '../errors';
import { requireAdmin, requireAuth } from '../auth/middleware';
import { gatewayPool } from '../hermes/pool';
import { requireParam } from '../http';
import { toApiUser, toCreditBalance } from '../users/profile';
import { provisionDefaults } from '../users/provision';
import { aggregateUsage, aggregateUsageByModel, dailyUsageSeries } from '../billing/usage';
import { JOB_NAME_RE, toJobSummary, userJobPrefix, userJobTag } from '../jobs/scope';
import { getEnabledSlugs, getEnabledToolkits } from '../composio/catalog';
import { getEnabledCommands } from '../commands/catalog';
import { composio } from '../composio/client';
import { assertModelsEnabled, assertModelSelectable, isModelSelectable, getEnabledModels } from '../llm/catalog';
import { encrypt, secretsConfigured } from '../crypto/secrets';

/** Admin-supplied Composio toolkit allowlist (validated against the enabled set in the handler). */
const composioToolkitsField = z.array(z.string().max(64)).max(200).optional();

/** Reject a per-user grant that includes a toolkit not enabled product-wide. */
async function assertToolkitsEnabled(slugs: string[] | undefined): Promise<void> {
  if (!slugs || slugs.length === 0) return;
  const enabled = await getEnabledSlugs();
  const bad = slugs.filter((s) => !enabled.has(s));
  if (bad.length > 0) {
    throw badRequest(`Toolkit(s) not enabled: ${bad.join(', ')}`, 'toolkit_not_enabled');
  }
}

/** Build the per-user Composio catalog (admin view: only globally-enabled toolkits; `allowed` = the grant). */
async function composioCatalogFor(granted: string[]): Promise<ComposioToolkit[]> {
  const grantedSet = new Set(granted);
  const enabled = await getEnabledToolkits();
  return enabled.map((t) => ({
    slug: t.slug,
    name: t.name,
    allowed: grantedSet.has(t.slug),
    connected: false,
  }));
}

/** Admin-supplied model grant allowlist (validated against the enabled set in the handler). */
const allowedModelsField = z.array(z.string().max(120)).max(200).optional();

/** Build the per-user model catalog (only globally-enabled models; `allowed` = the grant). */
async function llmCatalogFor(granted: string[]): Promise<AdminUserModel[]> {
  const grantedSet = new Set(granted);
  const enabled = await getEnabledModels();
  return enabled.map((m) => ({
    slug: m.slug,
    label: m.label,
    provider: m.provider,
    allowed: grantedSet.has(m.slug),
  }));
}

/** Admin-supplied slash-command allowlist (validated against the enabled set in the handler). */
const enabledCommandsField = z.array(z.string().max(64)).max(200).optional();

/** Reject a per-user grant that includes a command not enabled product-wide. */
async function assertCommandsEnabled(names: string[] | undefined): Promise<void> {
  if (!names || names.length === 0) return;
  const enabled = new Set((await getEnabledCommands()).map((c) => c.name));
  const bad = names.filter((n) => !enabled.has(n));
  if (bad.length > 0) {
    throw badRequest(`Command(s) not enabled: ${bad.join(', ')}`, 'command_not_enabled');
  }
}

/** Build the per-user command catalog (admin view: only globally-enabled commands; `allowed` = the grant). */
async function commandCatalogFor(granted: string[]): Promise<AdminUserCommand[]> {
  const grantedSet = new Set(granted);
  const enabled = await getEnabledCommands();
  return enabled.map((c) => ({
    name: c.name,
    description: c.description,
    type: c.type,
    allowed: grantedSet.has(c.name),
  }));
}

const tierBody = z.object({
  tier: z.enum(['free', 'dedicated']),
  /** Reserve a specific pool gateway for this user (dedicated tier only). */
  dedicatedGatewayId: z.string().min(1).nullable().optional(),
});

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
    hasToppedUp: user.hasToppedUp,
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
      select: { createdAt: true, creditsCharged: true },
    });
    const chart = dailyUsageSeries(
      recentMessages.map((m) => ({ createdAt: m.createdAt, credits: m.creditsCharged ?? 0 })),
      CHART_DAYS,
    );

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
      neverToppedUp: users.filter((u) => !u.hasToppedUp).length,
      chart,
      alerts,
      activity,
    };
    res.json(overview);
  }),
);

// Per-model token usage + USD cost over a window. USD is recomputed from current model prices.
const ANALYTICS_RANGES = [7, 14, 30, 90] as const;

adminRouter.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const requested = Number(req.query.days);
    const days = (ANALYTICS_RANGES as readonly number[]).includes(requested) ? requested : 30;
    const analytics: AdminAnalytics = await aggregateUsageByModel(days);
    res.json(analytics);
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

async function userUsage(userId: string): Promise<AdminUserDetail['usage']> {
  const since = new Date(Date.now() - CHART_DAYS * 24 * 60 * 60 * 1000);
  const [totals, rows] = await Promise.all([
    aggregateUsage({ userId }),
    prisma.message.findMany({
      where: { userId, role: 'assistant', createdAt: { gte: since } },
      select: { createdAt: true, creditsCharged: true },
    }),
  ]);
  return {
    ...totals,
    chart: dailyUsageSeries(
      rows.map((m) => ({ createdAt: m.createdAt, credits: m.creditsCharged ?? 0 })),
      CHART_DAYS,
    ),
  };
}

adminRouter.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw notFound('User not found');
    }
    const [count, toolsets, skills, jobs, usage, composioCatalog, commandCatalog, llmCatalog] =
      await Promise.all([
        prisma.conversation.count({ where: { userId: id } }),
        userToolsets(user),
        userSkills(),
        userJobs(id),
        userUsage(id),
        composioCatalogFor(user.composioToolkits),
        commandCatalogFor(user.enabledCommands),
        llmCatalogFor(user.allowedModels),
      ]);
    const detail: AdminUserDetail = {
      ...toAdminUser(user, count),
      instructions: user.instructions ?? null,
      memoryEnabled: user.memoryEnabled,
      toolsets,
      skills,
      enabledSkills: user.enabledSkills,
      composioEnabled: user.composioEnabled,
      composioToolkits: user.composioToolkits,
      composioCatalog,
      commandCatalog,
      enabledCommands: user.enabledCommands,
      llmCatalog,
      allowedModels: user.allowedModels,
      jobs,
      usage,
    };
    res.json(detail);
  }),
);

const updateBody = z.object({
  model: z.string().max(120).optional(),
  instructions: z.string().max(8000).nullable().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  enabledToolsets: z.array(z.string().max(80)).max(64).optional(),
  enabledSkills: z.array(z.string().max(80)).max(64).optional(),
  composioEnabled: z.boolean().optional(),
  composioToolkits: composioToolkitsField,
  enabledCommands: enabledCommandsField,
  allowedModels: allowedModelsField,
});

adminRouter.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const input = updateBody.parse(req.body);
    await assertToolkitsEnabled(input.composioToolkits);
    await assertCommandsEnabled(input.enabledCommands);
    await assertModelsEnabled(input.allowedModels);
    const exists = await prisma.user.findUnique({
      where: { id },
      select: { id: true, allowedModels: true, model: true },
    });
    if (!exists) {
      throw notFound('User not found');
    }
    const effectiveAllowed = input.allowedModels ?? exists.allowedModels;
    // Vet an explicitly-assigned model against the grant in effect after this update.
    await assertModelSelectable(input.model, effectiveAllowed);
    // Revoking a grant must not leave the user pinned to a now-forbidden model: when the grant
    // changes and the stored model is no longer selectable, clear it back to the default.
    const clearDanglingModel =
      input.model === undefined &&
      input.allowedModels !== undefined &&
      !(await isModelSelectable(exists.model, effectiveAllowed));
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(clearDanglingModel ? { model: null } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.enabledToolsets !== undefined ? { enabledToolsets: input.enabledToolsets } : {}),
        ...(input.enabledSkills !== undefined ? { enabledSkills: input.enabledSkills } : {}),
        ...(input.composioEnabled !== undefined ? { composioEnabled: input.composioEnabled } : {}),
        ...(input.composioToolkits !== undefined ? { composioToolkits: input.composioToolkits } : {}),
        ...(input.enabledCommands !== undefined ? { enabledCommands: input.enabledCommands } : {}),
        ...(input.allowedModels !== undefined ? { allowedModels: input.allowedModels } : {}),
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
      data: { creditsPurchased: { increment: amount }, lastTopupAt: new Date(), hasToppedUp: true },
    });
    const count = await prisma.conversation.count({ where: { userId: id } });
    res.json(toAdminUser(user, count));
  }),
);

const inviteBody = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  startingCredits: z.number().int().min(0).max(1_000_000).optional(),
  // Optional agent-profile config applied at creation; omitted fields fall back to provision defaults.
  model: z.string().max(120).optional(),
  instructions: z.string().max(8000).nullable().optional(),
  enabledToolsets: z.array(z.string().max(80)).max(64).optional(),
  enabledSkills: z.array(z.string().max(80)).max(64).optional(),
  composioEnabled: z.boolean().optional(),
  composioToolkits: composioToolkitsField,
  allowedModels: allowedModelsField,
});

adminRouter.post(
  '/invite',
  asyncHandler(async (req, res) => {
    const input = inviteBody.parse(req.body);
    await assertToolkitsEnabled(input.composioToolkits);
    await assertModelsEnabled(input.allowedModels);
    await assertModelSelectable(input.model, input.allowedModels ?? []);
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw badRequest('Email already registered', 'email_taken');
    }
    // A starter/invite grant is not a purchase — leave hasToppedUp false so the CTA still targets them.
    const user = await prisma.user.create({
      data: {
        email,
        name: input.name ?? null,
        ...provisionDefaults(input.startingCredits),
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.enabledToolsets !== undefined ? { enabledToolsets: input.enabledToolsets } : {}),
        ...(input.enabledSkills !== undefined ? { enabledSkills: input.enabledSkills } : {}),
        ...(input.composioEnabled !== undefined ? { composioEnabled: input.composioEnabled } : {}),
        ...(input.composioToolkits !== undefined ? { composioToolkits: input.composioToolkits } : {}),
        ...(input.allowedModels !== undefined ? { allowedModels: input.allowedModels } : {}),
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

/**
 * Grant or revoke a user's service tier — the operator seam for the paid upgrade until billing
 * exists. Setting `dedicated` (optionally pinned to a reserved gateway) raises their quota and
 * routes their new conversations to that gateway; `free` clears any binding.
 */
adminRouter.patch(
  '/users/:id/tier',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const input = tierBody.parse(req.body);
    if (input.dedicatedGatewayId && !gatewayPool.byGatewayId(input.dedicatedGatewayId)) {
      throw badRequest(`Unknown gateway: ${input.dedicatedGatewayId}`, 'unknown_gateway');
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw notFound('User not found');
    }
    const updated = await prisma.user.update({
      where: { id },
      data: {
        tier: input.tier,
        dedicatedGatewayId: input.tier === 'dedicated' ? input.dedicatedGatewayId ?? null : null,
      },
    });
    res.json(toApiUser(updated));
  }),
);

// ── MCP servers (global, remote-URL only) ────────────────────────────────────
// Managed on the resolved gateway's config; each becomes a toolset that admins
// then restrict per user via the existing enabledToolsets toggles.

const createMcpBody = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Use letters, numbers, dashes or underscores'),
  url: z.string().url().startsWith('https://', 'Must be an https:// URL'),
  transport: z.enum(['http', 'sse']).optional(),
  headers: z.record(z.string().max(200)).optional(),
  timeout: z.number().int().positive().max(3600).optional(),
});

adminRouter.get(
  '/mcp-servers',
  asyncHandler(async (_req, res) => {
    const items = await gateway().client.listMcpServers();
    res.json({ items });
  }),
);

adminRouter.post(
  '/mcp-servers',
  asyncHandler(async (req, res) => {
    const input = createMcpBody.parse(req.body);
    const result = await gateway().client.createMcpServer(input);
    res.status(201).json(result);
  }),
);

adminRouter.delete(
  '/mcp-servers/:name',
  asyncHandler(async (req, res) => {
    await gateway().client.deleteMcpServer(requireParam(req, 'name'));
    res.status(204).end();
  }),
);

// ── Composio toolkit catalog (global enable/disable) ─────────────────────────
// Admin curates which Composio toolkits exist product-wide; only enabled ones
// are grantable per user (User.composioToolkits). Disabling cascades: revoke the
// grant from every user AND disconnect their connected accounts.

adminRouter.get(
  '/composio/toolkits',
  asyncHandler(async (req, res) => {
    if (!composio.isConfigured()) {
      res.json({ configured: false, items: [] });
      return;
    }
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const [catalog, enabled] = await Promise.all([composio.listToolkits(q), getEnabledSlugs()]);
    // Per-toolkit grant counts (only for enabled ones) so the UI can warn before disable.
    const counts = new Map<string, number>();
    await Promise.all(
      [...enabled].map(async (slug) => {
        counts.set(slug, await prisma.user.count({ where: { composioToolkits: { has: slug } } }));
      }),
    );
    const items: AdminComposioToolkit[] = catalog.map((t) => ({
      slug: t.slug,
      name: t.name,
      logo: t.logo,
      description: t.description,
      toolsCount: t.toolsCount,
      enabled: enabled.has(t.slug),
      userCount: counts.get(t.slug) ?? 0,
    }));
    res.json({ configured: true, items });
  }),
);

const toggleComposioBody = z.object({
  enabled: z.boolean(),
  name: z.string().max(120).optional(),
});

adminRouter.patch(
  '/composio/toolkits/:slug',
  asyncHandler(async (req, res) => {
    const slug = requireParam(req, 'slug').toLowerCase();
    const input = toggleComposioBody.parse(req.body);

    if (input.enabled) {
      let name = input.name;
      if (!name && composio.isConfigured()) {
        const found = (await composio.listToolkits(slug)).find((t) => t.slug === slug);
        name = found?.name;
      }
      await prisma.composioToolkit.upsert({
        where: { slug },
        update: { name: name ?? slug },
        create: { slug, name: name ?? slug },
      });
      res.json({ slug, enabled: true, disconnected: 0, revokedFrom: 0 });
      return;
    }

    // Disable: delete the row + strip the slug from every user's grant (one txn)…
    const revokedFrom = await prisma.$transaction(async (tx) => {
      await tx.composioToolkit.deleteMany({ where: { slug } });
      return tx.$executeRaw`
        UPDATE "users"
        SET composio_toolkits = array_remove(composio_toolkits, ${slug})
        WHERE ${slug} = ANY(composio_toolkits)`;
    });
    // …then disconnect everyone's Composio accounts for it (best-effort).
    let disconnected = 0;
    if (composio.isConfigured()) {
      try {
        disconnected = await composio.disconnectToolkitForAll(slug);
      } catch (err) {
        logger.warn({ err, slug }, 'composio: disconnect-all failed during disable');
      }
    }
    res.json({ slug, enabled: false, disconnected, revokedFrom });
  }),
);

// ── First-party LLM providers + models ───────────────────────────────────────
// Admin registers providers (API key encrypted at rest, never returned) and the
// models under them. Enabled models are grantable per user (User.allowedModels)
// and injected per-turn so any pooled gateway can serve them. Deleting a provider
// or model strips its slugs from every user's grant.

const providerKindField = z.enum(LLM_PROVIDER_KINDS);

const createProviderBody = z.object({
  name: z.string().min(1).max(120),
  kind: providerKindField,
  baseUrl: z.string().url().max(500).nullable().optional(),
  apiKey: z.string().min(1).max(2000),
  enabled: z.boolean().optional(),
});

const updateProviderBody = z.object({
  name: z.string().min(1).max(120).optional(),
  kind: providerKindField.optional(),
  baseUrl: z.string().url().max(500).nullable().optional(),
  apiKey: z.string().min(1).max(2000).optional(),
  enabled: z.boolean().optional(),
});

// USD per 1,000,000 tokens. Nullable: null clears the price, omit leaves it unchanged on update.
const priceField = z.number().nonnegative().max(100000).nullable().optional();

const upsertModelBody = z.object({
  slug: z.string().min(1).max(120),
  modelId: z.string().min(1).max(200),
  label: z.string().min(1).max(120),
  enabled: z.boolean().optional(),
  inputUsdPerMTok: priceField,
  outputUsdPerMTok: priceField,
});

const updateModelBody = z.object({
  modelId: z.string().min(1).max(200).optional(),
  label: z.string().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  inputUsdPerMTok: priceField,
  outputUsdPerMTok: priceField,
});

type AdminModelRow = {
  slug: string;
  modelId: string;
  label: string;
  enabled: boolean;
  inputUsdPerMTok: Prisma.Decimal | null;
  outputUsdPerMTok: Prisma.Decimal | null;
};

function toAdminModel(m: AdminModelRow): AdminLlmModel {
  return {
    slug: m.slug,
    modelId: m.modelId,
    label: m.label,
    enabled: m.enabled,
    inputUsdPerMTok: m.inputUsdPerMTok == null ? null : Number(m.inputUsdPerMTok),
    outputUsdPerMTok: m.outputUsdPerMTok == null ? null : Number(m.outputUsdPerMTok),
  };
}

type ProviderWithModels = {
  id: string;
  name: string;
  kind: string;
  baseUrl: string | null;
  apiKeyEnc: string;
  enabled: boolean;
  models: AdminModelRow[];
};

function toAdminProvider(p: ProviderWithModels): AdminLlmProvider {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind as LlmProviderKind,
    baseUrl: p.baseUrl,
    enabled: p.enabled,
    hasKey: Boolean(p.apiKeyEnc),
    models: p.models.map(toAdminModel),
  };
}

/** Reject openai-compatible providers without a base URL (the gateway needs an endpoint). */
function assertBaseUrlForKind(kind: LlmProviderKind, baseUrl: string | null | undefined): void {
  if (kind === 'openai-compatible' && !baseUrl) {
    throw badRequest("kind 'openai-compatible' requires a baseUrl", 'base_url_required');
  }
}

/** Remove model slugs from every user's grant allowlist (one statement per slug). */
async function stripModelGrants(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  slugs: string[],
): Promise<void> {
  for (const slug of slugs) {
    await tx.$executeRaw`
      UPDATE "users"
      SET allowed_models = array_remove(allowed_models, ${slug})
      WHERE ${slug} = ANY(allowed_models)`;
  }
}

adminRouter.get(
  '/llm/providers',
  asyncHandler(async (_req, res) => {
    const providers = await prisma.llmProvider.findMany({
      orderBy: { createdAt: 'asc' },
      include: { models: { orderBy: { label: 'asc' } } },
    });
    res.json({ configured: secretsConfigured(), items: providers.map(toAdminProvider) });
  }),
);

adminRouter.post(
  '/llm/providers',
  asyncHandler(async (req, res) => {
    if (!secretsConfigured()) {
      throw badRequest('SECRETS_KEY is not configured — cannot store provider keys', 'secrets_unconfigured');
    }
    const input = createProviderBody.parse(req.body);
    assertBaseUrlForKind(input.kind, input.baseUrl);
    const provider = await prisma.llmProvider.create({
      data: {
        name: input.name,
        kind: input.kind,
        baseUrl: input.baseUrl ?? null,
        apiKeyEnc: encrypt(input.apiKey),
        enabled: input.enabled ?? true,
      },
      include: { models: true },
    });
    res.status(201).json(toAdminProvider(provider));
  }),
);

adminRouter.patch(
  '/llm/providers/:id',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const input = updateProviderBody.parse(req.body);
    const existing = await prisma.llmProvider.findUnique({ where: { id } });
    if (!existing) {
      throw notFound('Provider not found');
    }
    const kind = input.kind ?? (existing.kind as LlmProviderKind);
    const baseUrl = input.baseUrl !== undefined ? input.baseUrl : existing.baseUrl;
    assertBaseUrlForKind(kind, baseUrl);
    const provider = await prisma.llmProvider.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
        ...(input.apiKey !== undefined ? { apiKeyEnc: encrypt(input.apiKey) } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
      include: { models: { orderBy: { label: 'asc' } } },
    });
    res.json(toAdminProvider(provider));
  }),
);

adminRouter.delete(
  '/llm/providers/:id',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const provider = await prisma.llmProvider.findUnique({
      where: { id },
      include: { models: { select: { slug: true } } },
    });
    if (!provider) {
      throw notFound('Provider not found');
    }
    const slugs = provider.models.map((m) => m.slug);
    await prisma.$transaction(async (tx) => {
      await tx.llmProvider.delete({ where: { id } }); // cascades model rows
      await stripModelGrants(tx, slugs);
    });
    res.json({ id, deleted: true, revokedModels: slugs.length });
  }),
);

adminRouter.post(
  '/llm/providers/:id/models',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const input = upsertModelBody.parse(req.body);
    const provider = await prisma.llmProvider.findUnique({ where: { id }, select: { id: true } });
    if (!provider) {
      throw notFound('Provider not found');
    }
    const clash = await prisma.llmModel.findUnique({ where: { slug: input.slug }, select: { slug: true } });
    if (clash) {
      throw badRequest(`Model slug already in use: ${input.slug}`, 'model_slug_taken');
    }
    const model = await prisma.llmModel.create({
      data: {
        slug: input.slug,
        providerId: id,
        modelId: input.modelId,
        label: input.label,
        enabled: input.enabled ?? true,
        inputUsdPerMTok: input.inputUsdPerMTok ?? null,
        outputUsdPerMTok: input.outputUsdPerMTok ?? null,
      },
    });
    res.status(201).json(toAdminModel(model));
  }),
);

adminRouter.patch(
  '/llm/models/:slug',
  asyncHandler(async (req, res) => {
    const slug = requireParam(req, 'slug');
    const input = updateModelBody.parse(req.body);
    const existing = await prisma.llmModel.findUnique({ where: { slug }, select: { slug: true } });
    if (!existing) {
      throw notFound('Model not found');
    }
    const model = await prisma.llmModel.update({
      where: { slug },
      data: {
        ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.inputUsdPerMTok !== undefined ? { inputUsdPerMTok: input.inputUsdPerMTok } : {}),
        ...(input.outputUsdPerMTok !== undefined ? { outputUsdPerMTok: input.outputUsdPerMTok } : {}),
      },
    });
    res.json(toAdminModel(model));
  }),
);

adminRouter.delete(
  '/llm/models/:slug',
  asyncHandler(async (req, res) => {
    const slug = requireParam(req, 'slug');
    const existing = await prisma.llmModel.findUnique({ where: { slug }, select: { slug: true } });
    if (!existing) {
      throw notFound('Model not found');
    }
    await prisma.$transaction(async (tx) => {
      await tx.llmModel.delete({ where: { slug } });
      await stripModelGrants(tx, [slug]);
    });
    res.json({ slug, deleted: true });
  }),
);

// ── Slash command catalog (curated) ──────────────────────────────────────────
// Admin curates the commands that exist product-wide; only enabled ones are usable
// (and grantable per user via User.enabledCommands). Three kinds: prompt template,
// skill/tool scope, and coded server action.

function toAdminCommand(
  row: {
    id: string;
    name: string;
    description: string;
    type: string;
    enabled: boolean;
    promptTemplate: string | null;
    scopeToolsets: string[];
    scopeSkills: string[];
    promptPrefix: string | null;
    actionKey: string | null;
    sortOrder: number;
  },
  grantCount: number,
): AdminSlashCommand {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as AdminSlashCommand['type'],
    enabled: row.enabled,
    promptTemplate: row.promptTemplate,
    scopeToolsets: row.scopeToolsets,
    scopeSkills: row.scopeSkills,
    promptPrefix: row.promptPrefix,
    actionKey: (row.actionKey as ServerActionKey | null) ?? null,
    sortOrder: row.sortOrder,
    grantCount,
  };
}

adminRouter.get(
  '/commands',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.slashCommand.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const counts = new Map<string, number>();
    await Promise.all(
      rows.map(async (r) => {
        counts.set(r.name, await prisma.user.count({ where: { enabledCommands: { has: r.name } } }));
      }),
    );
    res.json({ items: rows.map((r) => toAdminCommand(r, counts.get(r.name) ?? 0)) });
  }),
);

const upsertCommandBody = z
  .object({
    id: z.string().uuid().optional(),
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Lowercase letters, numbers, dashes or underscores'),
    description: z.string().min(1).max(280),
    type: z.enum(['prompt', 'skill_scope', 'server_action']),
    enabled: z.boolean().optional(),
    promptTemplate: z.string().max(8000).nullable().optional(),
    scopeToolsets: z.array(z.string().max(80)).max(64).optional(),
    scopeSkills: z.array(z.string().max(80)).max(64).optional(),
    promptPrefix: z.string().max(4000).nullable().optional(),
    actionKey: z.enum(SERVER_ACTION_KEYS).nullable().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  })
  .refine((b) => b.type !== 'prompt' || (b.promptTemplate?.trim().length ?? 0) > 0, {
    message: 'Prompt commands need a template',
    path: ['promptTemplate'],
  })
  .refine((b) => b.type !== 'server_action' || !!b.actionKey, {
    message: 'Server-action commands need an action',
    path: ['actionKey'],
  });

adminRouter.post(
  '/commands',
  asyncHandler(async (req, res) => {
    const input = upsertCommandBody.parse(req.body);
    const data = {
      name: input.name.toLowerCase(),
      description: input.description,
      type: input.type,
      enabled: input.enabled ?? true,
      promptTemplate: input.type === 'prompt' ? input.promptTemplate ?? null : null,
      scopeToolsets: input.type === 'skill_scope' ? input.scopeToolsets ?? [] : [],
      scopeSkills: input.type === 'skill_scope' ? input.scopeSkills ?? [] : [],
      promptPrefix: input.type === 'skill_scope' ? input.promptPrefix ?? null : null,
      actionKey: input.type === 'server_action' ? input.actionKey ?? null : null,
      sortOrder: input.sortOrder ?? 0,
    };
    try {
      const row = input.id
        ? await prisma.slashCommand.update({ where: { id: input.id }, data })
        : await prisma.slashCommand.create({ data });
      res.status(input.id ? 200 : 201).json(toAdminCommand(row, 0));
    } catch (err) {
      if (err && typeof err === 'object' && (err as { code?: string }).code === 'P2002') {
        throw badRequest(`A command named /${data.name} already exists`, 'command_name_taken');
      }
      throw err;
    }
  }),
);

adminRouter.delete(
  '/commands/:id',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const row = await prisma.slashCommand.findUnique({ where: { id }, select: { name: true } });
    if (!row) {
      throw notFound('Command not found');
    }
    // Delete the command and strip its name from every user's per-user allowlist.
    await prisma.$transaction([
      prisma.slashCommand.delete({ where: { id } }),
      prisma.$executeRaw`
        UPDATE "users"
        SET enabled_commands = array_remove(enabled_commands, ${row.name})
        WHERE ${row.name} = ANY(enabled_commands)`,
    ]);
    res.status(204).end();
  }),
);
