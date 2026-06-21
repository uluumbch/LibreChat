import { useState } from 'react';
import clsx from 'clsx';
import { useCreateJob, useDeleteJob, useJobAction, useJobs } from '~/data/queries';
import { Button, Spinner } from '~/components/ui';

function formatWhen(ts?: number | null): string {
  if (!ts) {
    return '—';
  }
  const ms = ts < 1e12 ? ts * 1000 : ts; // Hermes uses epoch seconds.
  return new Date(ms).toLocaleString();
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-surface-dark-muted p-6 text-zinc-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="text-lg font-semibold">Scheduled jobs</h2>
        <p className="mb-4 mt-1 text-sm text-zinc-400">
          The agent runs these on a schedule. Results are delivered on the gateway.
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="mb-4 space-y-2 rounded-xl bg-black/20 p-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name (e.g. Morning digest)"
              className="w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
            />
            <input
              value={schedule}
              onChange={(event) => setSchedule(event.target.value)}
              placeholder="Schedule (cron, or e.g. every day at 9am)"
              className="w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
            />
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={2}
              placeholder="Prompt to run on schedule…"
              className="w-full resize-none rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
            />
            {formError && <p className="text-xs text-red-400">{formError}</p>}
            <div className="flex justify-end">
              <Button onClick={() => void submit()} disabled={!canCreate}>
                {createJob.isPending ? <Spinner /> : 'Add job'}
              </Button>
            </div>
          </div>

          {jobsQuery.isLoading && <Spinner size={16} />}
          {!jobsQuery.isLoading && jobs.length === 0 && (
            <p className="text-sm text-zinc-500">No scheduled jobs yet.</p>
          )}
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.id} className="rounded-lg bg-black/20 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-200">{job.name}</div>
                    <div className="mt-0.5 text-xs text-zinc-400">{job.scheduleDisplay || '—'}</div>
                  </div>
                  <span
                    className={clsx(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase ring-1',
                      job.enabled ? 'text-emerald-300 ring-emerald-500/40' : 'text-zinc-400 ring-white/15',
                    )}
                  >
                    {job.enabled ? 'on' : 'paused'}
                  </span>
                </div>
                {job.prompt && <p className="mt-1 truncate text-xs text-zinc-500">{job.prompt}</p>}
                <div className="mt-1 text-[11px] text-zinc-600">
                  Next: {formatWhen(job.nextRunAt)}
                  {job.lastStatus ? ` · Last: ${job.lastStatus}` : ''}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    className="ring-1 ring-white/10"
                    onClick={() =>
                      jobAction.mutate({ id: job.id, action: job.enabled ? 'pause' : 'resume' })
                    }
                  >
                    {job.enabled ? 'Pause' : 'Resume'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="ring-1 ring-white/10"
                    onClick={() => jobAction.mutate({ id: job.id, action: 'run' })}
                  >
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

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
