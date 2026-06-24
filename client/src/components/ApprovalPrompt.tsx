import clsx from 'clsx';
import type { ApprovalChoice, ApprovalEvent } from '@hermes/shared';

const CHOICE_LABELS: Record<ApprovalChoice, string> = {
  once: 'Allow once',
  session: 'Allow this session',
  always: 'Always allow',
  deny: 'Deny',
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
    <div
      className="animate-hm-slidein mb-3 rounded-[14px] border border-amber-500/30 p-4 shadow-[0_12px_34px_rgba(0,0,0,0.12)]"
      style={{
        background: 'linear-gradient(180deg,rgba(245,177,74,0.10),rgba(245,177,74,0.04))',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] bg-amber-500/[0.16]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
            <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5Z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-amber-800">
            The agent needs your approval to run a tool
          </div>
          {approval.description && (
            <div className="mt-1 text-[12.5px] leading-relaxed text-amber-700">
              {approval.description}
            </div>
          )}
          {approval.command && (
            <div className="mt-2.5 flex items-center gap-2 overflow-x-auto rounded-[9px] border border-amber-500/20 bg-surface-input px-3 py-2.5 font-mono text-[12.5px]">
              <span className="text-amber-700">$</span>
              <span className="text-ink">{approval.command}</span>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {approval.choices.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => onRespond(choice)}
                className={clsx(
                  'rounded-[9px] px-3.5 py-2 text-[13px] font-medium transition',
                  choice === 'once' &&
                    'bg-brand font-semibold text-white shadow-brand hover:bg-brand-dark',
                  (choice === 'session' || choice === 'always') &&
                    'border border-black/10 bg-surface-bubble text-ink-soft hover:bg-zinc-200',
                  choice === 'deny' &&
                    'ml-auto border border-red-400/30 bg-red-500/10 font-semibold text-red-700 hover:bg-red-500/20',
                )}
              >
                {CHOICE_LABELS[choice]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
