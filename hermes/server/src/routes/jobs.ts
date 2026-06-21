import { Router } from 'express';
import crypto from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import type { HermesJob, JobSummary } from '@hermes/shared';
import { asyncHandler, notFound } from '../errors';
import { getUserId, requireAuth } from '../auth/middleware';
import { config } from '../config';
import { gatewayPool } from '../hermes/pool';
import { requireParam } from '../http';

const createBody = z.object({
  name: z.string().min(1).max(80),
  schedule: z.string().min(1).max(200),
  prompt: z.string().min(1).max(10_000),
});

/**
 * Hermes' cron is gateway-global, so we scope jobs per user with an opaque name prefix: list filters
 * to the user's prefix, mutations verify ownership, and the prefix is stripped for display.
 */
function userPrefix(userId: string): string {
  const tag = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 8);
  return `[hc:${tag}] `;
}

function toSummary(job: HermesJob, prefix: string): JobSummary {
  const name = job.name ?? '';
  return {
    id: job.id,
    name: name.startsWith(prefix) ? name.slice(prefix.length) : name,
    prompt: job.prompt ?? '',
    scheduleDisplay: job.schedule_display ?? '',
    enabled: job.enabled ?? true,
    state: job.state,
    nextRunAt: job.next_run_at ?? null,
    lastRunAt: job.last_run_at ?? null,
    lastStatus: job.last_status ?? null,
  };
}

function gateway() {
  return gatewayPool.resolve(config.defaultModel);
}

/** Fetch a job and assert it belongs to the requesting user (else 404). */
async function ownedJob(req: Request): Promise<{ job: HermesJob; prefix: string }> {
  const prefix = userPrefix(getUserId(req));
  const id = requireParam(req, 'id');
  const resp = await gateway().client.getJob(id).catch(() => null);
  if (!resp?.job || !(resp.job.name ?? '').startsWith(prefix)) {
    throw notFound('Job not found');
  }
  return { job: resp.job, prefix };
}

export const jobsRouter: Router = Router();
jobsRouter.use(requireAuth);

jobsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const prefix = userPrefix(getUserId(req));
    const { jobs } = await gateway().client.listJobs();
    const items = jobs
      .filter((job) => (job.name ?? '').startsWith(prefix))
      .map((job) => toSummary(job, prefix));
    res.json({ items });
  }),
);

jobsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const prefix = userPrefix(getUserId(req));
    const input = createBody.parse(req.body);
    const { job } = await gateway().client.createJob({
      name: `${prefix}${input.name}`,
      schedule: input.schedule,
      prompt: input.prompt,
    });
    res.status(201).json(toSummary(job, prefix));
  }),
);

jobsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { job } = await ownedJob(req);
    await gateway().client.deleteJob(job.id);
    res.status(204).end();
  }),
);

jobsRouter.post(
  '/:id/:action',
  asyncHandler(async (req, res) => {
    const action = requireParam(req, 'action');
    if (action !== 'pause' && action !== 'resume' && action !== 'run') {
      throw notFound('Unknown job action');
    }
    const { job, prefix } = await ownedJob(req);
    await gateway().client.jobAction(job.id, action);
    const updated = await gateway().client.getJob(job.id).catch(() => null);
    res.json(toSummary(updated?.job ?? job, prefix));
  }),
);
