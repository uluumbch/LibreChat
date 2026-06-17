import clsx from 'clsx';
import type { ToolStepPart } from '@hermes/shared';
import { Spinner } from '~/components/ui';

function StatusDot({ status }: { status: ToolStepPart['status'] }): JSX.Element {
  return (
    <span
      className={clsx(
        'inline-block h-2 w-2 rounded-full',
        status === 'error' ? 'bg-red-400' : status === 'completed' ? 'bg-emerald-400' : 'bg-zinc-500',
      )}
    />
  );
}

export function ToolStepView({ step }: { step: ToolStepPart }): JSX.Element {
  return (
    <div className="my-1 flex items-center gap-2 rounded-lg bg-black/20 px-3 py-1.5 text-xs text-zinc-300">
      {step.status === 'running' ? <Spinner size={13} /> : <StatusDot status={step.status} />}
      <span className="font-medium text-zinc-200">{step.label ?? step.toolName}</span>
      {step.preview && <span className="truncate text-zinc-500">{step.preview}</span>}
    </div>
  );
}
