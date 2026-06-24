import crypto from 'node:crypto';
import type { HermesJob, JobSummary } from '@hermes/shared';

/**
 * Hermes' cron is gateway-global, so jobs are scoped per user with an opaque name prefix:
 * `[hc:<tag>] `. The tag is a stable 8-char digest of the user id. Listing filters by prefix,
 * mutations verify ownership, and the prefix is stripped for display.
 */
export function userJobTag(userId: string): string {
  return crypto.createHash('sha256').update(userId).digest('hex').slice(0, 8);
}

export function userJobPrefix(userId: string): string {
  return `[hc:${userJobTag(userId)}] `;
}

/** Matches a scoped job name and captures the owner tag. */
export const JOB_NAME_RE = /^\[hc:([0-9a-f]{8})\] /;

/** Maps a Hermes job to the API summary, stripping the given owner prefix from its name. */
export function toJobSummary(job: HermesJob, prefix: string): JobSummary {
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
