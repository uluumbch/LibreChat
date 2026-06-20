import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Button } from '~/components/ui';

const AGENTIC_KEY = 'hermes:agentic';

export function Composer({
  onSend,
  onStop,
  isStreaming,
  disabled,
}: {
  onSend: (text: string, agentic: boolean) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}): JSX.Element {
  const [text, setText] = useState('');
  const [agentic, setAgentic] = useState<boolean>(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(AGENTIC_KEY) === '1',
  );

  const toggleAgentic = () => {
    setAgentic((prev) => {
      const next = !prev;
      localStorage.setItem(AGENTIC_KEY, next ? '1' : '0');
      return next;
    });
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || disabled) {
      return;
    }
    onSend(trimmed, agentic);
    setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-white/10 bg-surface-dark px-4 py-3">
      <div className="mx-auto mb-2 flex max-w-3xl items-center">
        <button
          type="button"
          onClick={toggleAgentic}
          title="Agentic mode: the agent pauses for your approval before risky tools, and shows its reasoning."
          aria-pressed={agentic}
          className={clsx(
            'rounded-full px-3 py-1 text-xs ring-1 transition',
            agentic
              ? 'bg-amber-600/80 text-white ring-amber-500'
              : 'text-zinc-400 ring-white/15 hover:text-zinc-200',
          )}
        >
          {agentic ? '🛡️ Agentic: on' : 'Agentic: off'}
        </button>
      </div>
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Message Hermes…"
          disabled={disabled}
          className="max-h-48 flex-1 resize-none rounded-xl bg-surface-dark-muted px-4 py-3 text-sm text-zinc-100 outline-none ring-1 ring-white/10 focus:ring-blue-500 disabled:opacity-60"
        />
        {isStreaming ? (
          <Button variant="danger" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button onClick={submit} disabled={disabled || text.trim().length === 0}>
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
