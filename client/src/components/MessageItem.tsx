import { useState } from 'react';
import type { Message, MessageContentPart } from '@hermes/shared';
import { ContentPartType } from '@hermes/shared';
import { Markdown } from '~/components/content/Markdown';
import { ToolStepView } from '~/components/content/ToolStepView';
import { BrandMark } from '~/components/ui';

function ReasoningBlock({ text }: { text: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex select-none items-center gap-1.5 text-[12.5px] font-medium text-ink-muted transition hover:text-ink-soft"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2h6c0-.8.4-1.5 1-2A7 7 0 0 0 12 2Z" />
        </svg>
        Reasoning
      </button>
      {open && (
        <div className="animate-hm-fade mt-2 whitespace-pre-wrap rounded-r-lg border-l-2 border-black/10 bg-black/[0.015] px-3.5 py-2.5 text-[13px] italic leading-relaxed text-ink-muted">
          {text}
        </div>
      )}
    </div>
  );
}

function Part({ part }: { part: MessageContentPart }): JSX.Element | null {
  switch (part.type) {
    case ContentPartType.Text:
      return (
        <div className="mb-2">
          <Markdown>{part.text}</Markdown>
        </div>
      );
    case ContentPartType.Reasoning:
      return <ReasoningBlock text={part.text} />;
    case ContentPartType.ToolStep:
      return <ToolStepView step={part} />;
    case ContentPartType.Image:
      return (
        <img
          src={part.url}
          alt={part.alt ?? ''}
          loading="lazy"
          className="my-2 max-h-96 max-w-full rounded-xl border border-black/10"
        />
      );
    case ContentPartType.File:
      return (
        <a
          href={part.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-brand-dark underline"
        >
          {part.name}
        </a>
      );
    default:
      return null;
  }
}

function UserTurn({ message }: { message: Message }): JSX.Element {
  const text =
    message.content.length > 0
      ? message.content
          .filter((p): p is Extract<MessageContentPart, { type: ContentPartType.Text }> =>
            p.type === ContentPartType.Text,
          )
          .map((p) => p.text)
          .join('\n') || message.text
      : message.text;
  const images = message.content.filter(
    (p): p is Extract<MessageContentPart, { type: ContentPartType.Image }> =>
      p.type === ContentPartType.Image,
  );
  return (
    <div className="animate-hm-slidein mb-7 flex justify-end">
      <div className="max-w-[80%]">
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap justify-end gap-2">
            {images.map((img, i) => (
              <img
                key={i}
                src={img.url}
                alt={img.alt ?? ''}
                className="max-h-48 rounded-xl border border-black/10"
              />
            ))}
          </div>
        )}
        <div className="rounded-[14px_14px_4px_14px] border border-black/[0.07] bg-surface-bubble px-3.5 py-2.5 text-sm leading-relaxed text-ink">
          {text}
        </div>
      </div>
    </div>
  );
}

function ErrorTurn({ message }: { message: Message }): JSX.Element {
  return (
    <div className="animate-hm-slidein mb-7 flex gap-3">
      <div className="mt-px flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-red-400/30 bg-red-400/[0.14]">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
          <path d="M12 8v5M12 17h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3">
        <div className="mb-1 text-[13px] font-semibold text-red-700">Turn failed</div>
        <div className="text-[13px] leading-relaxed text-red-900/60">
          {message.text || 'The agent could not complete this turn.'}
        </div>
      </div>
    </div>
  );
}

export function MessageItem({
  message,
  streaming,
}: {
  message: Message;
  streaming: boolean;
}): JSX.Element {
  if (message.role === 'user') {
    return <UserTurn message={message} />;
  }
  if (message.error) {
    return <ErrorTurn message={message} />;
  }

  const isTyping = streaming && message.content.length === 0;

  return (
    <div className="animate-hm-slidein mb-7 flex gap-3">
      <div className="mt-px flex-none">
        <BrandMark size={28} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {isTyping ? (
          <span className="inline-flex gap-1">
            <span className="h-1.5 w-1.5 animate-hm-pulse rounded-full bg-ink-faint" />
            <span
              className="h-1.5 w-1.5 animate-hm-pulse rounded-full bg-ink-faint"
              style={{ animationDelay: '0.2s' }}
            />
            <span
              className="h-1.5 w-1.5 animate-hm-pulse rounded-full bg-ink-faint"
              style={{ animationDelay: '0.4s' }}
            />
          </span>
        ) : (
          message.content.map((part, index) => <Part key={index} part={part} />)
        )}
      </div>
    </div>
  );
}
