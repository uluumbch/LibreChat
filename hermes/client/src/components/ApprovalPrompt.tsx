import type { ApprovalChoice, ApprovalEvent } from '@hermes/shared';
import { Button } from '~/components/ui';

const CHOICE_LABELS: Record<ApprovalChoice, string> = {
  once: 'Allow once',
  session: 'Allow this session',
  always: 'Always allow',
  deny: 'Deny',
};

const CHOICE_VARIANT: Record<ApprovalChoice, 'primary' | 'ghost' | 'danger'> = {
  once: 'primary',
  session: 'ghost',
  always: 'ghost',
  deny: 'danger',
};

/** Renders a pending tool-approval gate from the agentic Runs engine. */
export function ApprovalPrompt({
  approval,
  onRespond,
}: {
  approval: ApprovalEvent;
  onRespond: (choice: ApprovalChoice) => void;
}): JSX.Element {
  return (
    <div className="mx-auto mb-2 max-w-3xl rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-200">
        <span aria-hidden="true">🛡️</span>
        <span>The agent needs your approval to run a tool</span>
      </div>
      {approval.description && (
        <p className="mt-1 text-xs text-amber-100/80">{approval.description}</p>
      )}
      {approval.command && (
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 px-3 py-2 text-xs text-zinc-200">
          {approval.command}
        </pre>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {approval.choices.map((choice) => (
          <Button key={choice} variant={CHOICE_VARIANT[choice]} onClick={() => onRespond(choice)}>
            {CHOICE_LABELS[choice]}
          </Button>
        ))}
      </div>
    </div>
  );
}
