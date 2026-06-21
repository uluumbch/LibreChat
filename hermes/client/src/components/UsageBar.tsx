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

/** Slim per-conversation usage summary read from the backing Hermes session. */
export function UsageBar({ conversationId }: { conversationId: string }): JSX.Element | null {
  const { data } = useConversationUsage(conversationId);
  if (!data || !hasAny(data)) {
    return null;
  }

  const chips: string[] = [];
  if (data.messageCount != null) {
    chips.push(`${data.messageCount} msg`);
  }
  if (data.toolCallCount) {
    chips.push(`${data.toolCallCount} tools`);
  }
  if (data.totalTokens != null) {
    const io: string[] = [];
    if (data.inputTokens != null) {
      io.push(`↑${compact(data.inputTokens)}`);
    }
    if (data.outputTokens != null) {
      io.push(`↓${compact(data.outputTokens)}`);
    }
    chips.push(`${compact(data.totalTokens)} tok${io.length ? ` (${io.join(' ')})` : ''}`);
  }
  if (data.reasoningTokens) {
    chips.push(`${compact(data.reasoningTokens)} reasoning`);
  }
  if (data.costUsd != null) {
    chips.push(`$${data.costUsd < 0.01 ? data.costUsd.toFixed(4) : data.costUsd.toFixed(2)}`);
  }

  return (
    <div
      className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 border-b border-white/5 px-4 py-1.5 text-xs text-zinc-500"
      aria-label="Conversation usage"
    >
      {chips.map((chip) => (
        <span key={chip}>{chip}</span>
      ))}
    </div>
  );
}
