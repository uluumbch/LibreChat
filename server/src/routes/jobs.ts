import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import type { HermesJob } from '@hermes/shared';
import { asyncHandler, notFound } from '../errors';
import { getUserId, requireAuth } from '../auth/middleware';
import { config } from '../config';
import { gatewayPool } from '../hermes/pool';
import { requireParam } from '../http';
import { toJobSummary, userJobPrefix } from '../jobs/scope';

const createBody = z.object({
  name: z.string().min(1).max(80),
  schedule: z.string().min(1).max(200),
  prompt: z.string().min(1).max(5000),
});

function gateway() {
  return gatewayPool.resolve(config.defaultModel);
}

/** Fetch a job and assert it belongs to the requesting user (else 404). */
async function ownedJob(req: Request): Promise<{ job: HermesJob; prefix: string }> {
  const prefix = userJobPrefix(getUserId(req));
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
    const prefix = userJobPrefix(getUserId(req));
    const { jobs } = await gateway().client.listJobs();
    const items = jobs
      .filter((job) => (job.name ?? '').startsWith(prefix))
      .map((job) => toJobSummary(job, prefix));
    res.json({ items });
  }),
);

jobsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const prefix = userJobPrefix(getUserId(req));
    const input = createBody.parse(req.body);
    const { job } = await gateway().client.createJob({
      name: `${prefix}${input.name}`,
      schedule: input.schedule,
      prompt: input.prompt,
    });
    res.status(201).json(toJobSummary(job, prefix));
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
    res.json(toJobSummary(updated?.job ?? job, prefix));
  }),
);
