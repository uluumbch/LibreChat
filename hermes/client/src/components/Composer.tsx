import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from '~/components/ui';

export function Composer({
  onSend,
  onStop,
  isStreaming,
  disabled,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}): JSX.Element {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || disabled) {
      return;
    }
    onSend(trimmed);
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
