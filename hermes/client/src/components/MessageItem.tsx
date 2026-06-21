import { useState } from 'react';
import clsx from 'clsx';
import type { Message, MessageContentPart } from '@hermes/shared';
import { ContentPartType } from '@hermes/shared';
import { Markdown } from '~/components/content/Markdown';
import { ToolStepView } from '~/components/content/ToolStepView';
import { Spinner } from '~/components/ui';

function ReasoningBlock({ text }: { text: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1 rounded-lg bg-black/20 text-xs">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-400 hover:text-zinc-200"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span>Reasoning</span>
      </button>
      {open && <div className="whitespace-pre-wrap px-3 pb-2 text-zinc-400">{text}</div>}
    </div>
  );
}

function Part({ part }: { part: MessageContentPart }): JSX.Element | null {
  switch (part.type) {
    case ContentPartType.Text:
      return <Markdown>{part.text}</Markdown>;
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
          className="my-2 max-h-96 max-w-full rounded-lg"
        />
      );
    case ContentPartType.File:
      return (
        <a
          href={part.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-blue-400 underline"
        >
          {part.name}
        </a>
      );
    default:
      return null;
  }
}

export function MessageItem({
  message,
  streaming,
}: {
  message: Message;
  streaming: boolean;
}): JSX.Element {
  const isUser = message.role === 'user';
  const showTyping = !isUser && streaming && message.content.length === 0;

  return (
    <div className={clsx('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[min(46rem,100%)] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser ? 'bg-blue-600 text-white' : 'bg-surface-dark-muted text-zinc-100',
          message.error && 'ring-1 ring-red-500/50',
        )}
      >
        {showTyping ? (
          <Spinner size={16} />
        ) : (
          message.content.map((part, index) => <Part key={index} part={part} />)
        )}
        {isUser && message.content.length === 0 && <span>{message.text}</span>}
      </div>
    </div>
  );
}
