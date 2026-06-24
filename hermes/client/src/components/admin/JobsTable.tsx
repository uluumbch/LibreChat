import type { AdminJob } from '@hermes/shared';
import { Spinner } from '~/components/ui';
import { MONO, jobBadgeStyle, jobWhen } from './theme';
import { Avatar, Card } from './primitives';
import { PlayIcon } from './icons';

const GRID = '1.7fr 1.6fr 1.3fr 1.2fr 1fr 150px';

export function JobsTable({
  jobs,
  isLoading,
  pendingId,
  onAction,
}: {
  jobs: AdminJob[];
  isLoading: boolean;
  pendingId: string | null;
  onAction: (id: string, action: 'pause' | 'resume' | 'run') => void;
}): JSX.Element {
  return (
    <Card style={{ overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: GRID,
          gap: 12,
          padding: '11px 20px',
          borderBottom: '1px solid #ebebef',
          background: '#fafafb',
          fontSize: 11,
          color: '#a1a1aa',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        <span>Job</span>
        <span>Owner</span>
        <span>Schedule</span>
        <span>Next run</span>
        <span>Status</span>
        <span />
      </div>

      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: '#a1a1aa' }}>
          <Spinner size={20} />
        </div>
      )}
      {!isLoading && jobs.length === 0 && (
        <div style={{ padding: 28, fontSize: 13, color: '#a1a1aa', textAlign: 'center' }}>
          No scheduled jobs across the workspace.
        </div>
      )}

      {jobs.map((job) => (
        <div
          key={job.id}
          style={{
            display: 'grid',
            gridTemplateColumns: GRID,
            gap: 12,
            padding: '13px 20px',
            borderBottom: '1px solid #f4f4f6',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 550,
              color: '#27272a',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {job.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Avatar seed={job.ownerId} name={job.ownerName} email={job.ownerEmail} size={24} />
            <span
              style={{
                fontSize: 12,
                color: '#71717a',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {job.ownerName}
            </span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: '#52525b' }}>
            {job.scheduleDisplay || '—'}
          </div>
          <div style={{ fontSize: 12, color: '#71717a' }}>
            {job.enabled ? jobWhen(job.nextRunAt) : 'paused'}
          </div>
          <div>
            <span style={jobBadgeStyle(job.enabled)}>{job.enabled ? 'on' : 'paused'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button
              type="button"
              disabled={pendingId === job.id}
              onClick={() => onAction(job.id, job.enabled ? 'pause' : 'resume')}
              style={{
                background: '#f4f4f6',
                border: '1px solid #e8e8ec',
                borderRadius: 7,
                padding: '5px 10px',
                color: '#52525b',
                fontSize: 11.5,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {job.enabled ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              title="Run now"
              disabled={pendingId === job.id}
              onClick={() => onAction(job.id, 'run')}
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: '#f4f4f6',
                border: '1px solid #e8e8ec',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#52525b',
                cursor: 'pointer',
              }}
            >
              <PlayIcon />
            </button>
          </div>
        </div>
      ))}
    </Card>
  );
}
