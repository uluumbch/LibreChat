import { useState } from 'react';
import clsx from 'clsx';
import { useCreateJob, useDeleteJob, useJobAction, useJobs } from '~/data/queries';
import { Button, Spinner } from '~/components/ui';

function formatWhen(ts?: string | null): string {
  if (!ts) {
    return '—';
  }
  const date = new Date(ts); // Hermes returns ISO-8601 timestamps.
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function JobsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const jobsQuery = useJobs();
  const createJob = useCreateJob();
  const deleteJob = useDeleteJob();
  const jobAction = useJobAction();

  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('');
  const [prompt, setPrompt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const canCreate =
    name.trim().length > 0 &&
    schedule.trim().length > 0 &&
    prompt.trim().length > 0 &&
    !createJob.isPending;

  const submit = async () => {
    setFormError(null);
    try {
      await createJob.mutateAsync({
        name: name.trim(),
        schedule: schedule.trim(),
        prompt: prompt.trim(),
      });
      setName('');
      setSchedule('');
      setPrompt('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create job');
    }
  };

  const jobs = jobsQuery.data?.items ?? [];

  return (
    <div
      className="animate-hm-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[3px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[88vh] w-[560px] max-w-[92vw] flex-col overflow-hidden rounded-[18px] border border-black/10 bg-white text-ink shadow-[0_30px_80px_rgba(0,0,0,0.25)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="border-b border-black/[0.07] px-5 py-4">
          <h2 className="text-base font-semibold">Scheduled jobs</h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            The agent runs these on a schedule. Results are delivered on the gateway.
          </p>
        </div>

        <div className="hm-scroll min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 space-y-2 rounded-[12px] border border-black/[0.07] bg-surface-input p-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name (e.g. Morning digest)"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand/40"
            />
            <input
              value={schedule}
              onChange={(event) => setSchedule(event.target.value)}
              placeholder="Schedule (cron, or e.g. every day at 9am)"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand/40"
            />
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={2}
              placeholder="Prompt to run on schedule…"
              className="w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand/40"
            />
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex justify-end">
              <Button onClick={() => void submit()} disabled={!canCreate}>
                {createJob.isPending ? <Spinner /> : 'Add job'}
              </Button>
            </div>
          </div>

          {jobsQuery.isLoading && <Spinner size={16} />}
          {!jobsQuery.isLoading && jobs.length === 0 && (
            <p className="text-sm text-ink-faint">No scheduled jobs yet.</p>
          )}
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.id} className="rounded-[10px] border border-black/[0.07] bg-white px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink-soft">{job.name}</div>
                    <div className="mt-0.5 font-mono text-xs text-ink-muted">
                      {job.scheduleDisplay || '—'}
                    </div>
                  </div>
                  <span
                    className={clsx(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                      job.enabled
                        ? 'bg-emerald-500/10 text-emerald-700'
                        : 'bg-black/[0.06] text-ink-faint',
                    )}
                  >
                    {job.enabled ? 'on' : 'paused'}
                  </span>
                </div>
                {job.prompt && <p className="mt-1 truncate text-xs text-ink-faint">{job.prompt}</p>}
                <div className="mt-1 text-[11px] text-ink-faint">
                  Next: {formatWhen(job.nextRunAt)}
                  {job.lastStatus ? ` · Last: ${job.lastStatus}` : ''}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      jobAction.mutate({ id: job.id, action: job.enabled ? 'pause' : 'resume' })
                    }
                  >
                    {job.enabled ? 'Pause' : 'Resume'}
                  </Button>
                  <Button variant="ghost" onClick={() => jobAction.mutate({ id: job.id, action: 'run' })}>
                    Run now
                  </Button>
                  <Button variant="danger" onClick={() => deleteJob.mutate(job.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end border-t border-black/[0.07] px-5 py-4">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
