import type { ToolStepPart } from '@hermes/shared';

function formatDuration(ms?: number): string {
  if (!ms) {
    return '';
  }
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function ToolStepView({ step }: { step: ToolStepPart }): JSX.Element {
  const { status } = step;
  return (
    <div className="mb-2 rounded-[10px] border border-black/[0.07] bg-white">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <span className="flex flex-none text-brand-dark">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" />
          </svg>
        </span>
        <span className="flex-none font-mono text-xs font-semibold text-ink-soft">
          {step.toolName}
        </span>
        {(step.label || step.preview) && (
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-muted">
            {step.label ?? step.preview}
          </span>
        )}
        <span className="flex flex-none items-center gap-1.5">
          {status === 'running' && (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand/30 border-t-brand-dark" />
              <span className="text-[11px] font-medium text-brand-dark">running</span>
            </>
          )}
          {status === 'completed' && (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {formatDuration(step.durationMs) && (
                <span className="font-mono text-[11px] text-ink-faint">
                  {formatDuration(step.durationMs)}
                </span>
              )}
            </>
          )}
          {status === 'error' && (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              <span className="text-[11px] font-medium text-red-600">error</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
