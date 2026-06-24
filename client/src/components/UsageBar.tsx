import type { ReactNode } from 'react';
import type { ConversationUsage } from '@hermes/shared';
import { useConversationUsage } from '~/data/queries';

function compact(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  return String(n);
}

function hasAny(u: ConversationUsage): boolean {
  return Boolean(
    u.messageCount || u.toolCallCount || u.inputTokens || u.outputTokens || u.totalTokens,
  );
}

const Dot = (): JSX.Element => <span className="text-zinc-300"> · </span>;

/** Slim inline per-conversation usage summary, rendered into the chat top bar. */
export function UsageBar({ conversationId }: { conversationId: string }): JSX.Element | null {
  const { data } = useConversationUsage(conversationId);
  if (!data || !hasAny(data)) {
    return null;
  }

  const chips: ReactNode[] = [];
  const push = (node: ReactNode) => {
    if (chips.length > 0) {
      chips.push(<Dot key={`d${chips.length}`} />);
    }
    chips.push(<span key={`c${chips.length}`}>{node}</span>);
  };

  if (data.messageCount != null) {
    push(`${data.messageCount} msg`);
  }
  if (data.toolCallCount) {
    push(`${data.toolCallCount} tools`);
  }
  if (data.totalTokens != null) {
    push(
      <>
        {compact(data.totalTokens)} tok
        {(data.inputTokens != null || data.outputTokens != null) && (
          <span className="text-zinc-400">
            {' ('}
            {data.inputTokens != null && (
              <>
                <span className="text-emerald-600">↑</span>
                {compact(data.inputTokens)}
              </>
            )}
            {data.outputTokens != null && (
              <>
                {' '}
                <span className="text-brand-dark">↓</span>
                {compact(data.outputTokens)}
              </>
            )}
            {')'}
          </span>
        )}
      </>,
    );
  }
  if (data.reasoningTokens) {
    push(`${compact(data.reasoningTokens)} rsn`);
  }
  if (data.costUsd != null) {
    push(
      <span className="text-ink-muted">
        ${data.costUsd < 0.01 ? data.costUsd.toFixed(4) : data.costUsd.toFixed(2)}
      </span>,
    );
  }

  return (
    <div
      className="hidden whitespace-nowrap font-mono text-[11.5px] tracking-tight text-ink-faint md:block"
      aria-label="Conversation usage"
    >
      {chips}
    </div>
  );
}
