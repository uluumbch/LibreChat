import { useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, DragEvent, KeyboardEvent } from 'react';
import clsx from 'clsx';
import type { ChatImageInput } from '@hermes/shared';
import { Button, Spinner } from '~/components/ui';
import { prepareImage } from '~/lib/image';
import type { PreparedImage } from '~/lib/image';

const AGENTIC_KEY = 'hermes:agentic';
const MAX_IMAGES = 4;

export function Composer({
  onSend,
  onStop,
  isStreaming,
  disabled,
}: {
  onSend: (text: string, agentic: boolean, images: ChatImageInput[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}): JSX.Element {
  const [text, setText] = useState('');
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [agentic, setAgentic] = useState<boolean>(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(AGENTIC_KEY) === '1',
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleAgentic = () => {
    setAgentic((prev) => {
      const next = !prev;
      localStorage.setItem(AGENTIC_KEY, next ? '1' : '0');
      return next;
    });
  };

  const addFiles = async (files: File[]) => {
    const incoming = files.filter((file) => file.type.startsWith('image/'));
    if (incoming.length === 0) {
      return;
    }
    setAttachError(null);
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setAttachError(`You can attach up to ${MAX_IMAGES} images`);
      return;
    }
    setPreparing(true);
    try {
      const prepared = await Promise.all(incoming.slice(0, room).map(prepareImage));
      setImages((prev) => [...prev, ...prepared].slice(0, MAX_IMAGES));
      if (incoming.length > room) {
        setAttachError(`Only ${MAX_IMAGES} images can be attached`);
      }
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Could not attach image');
    } finally {
      setPreparing(false);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.some((file) => file.type.startsWith('image/'))) {
      event.preventDefault();
      void addFiles(files);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer.files);
    if (files.some((file) => file.type.startsWith('image/'))) {
      event.preventDefault();
      void addFiles(files);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const canSend =
    (text.trim().length > 0 || images.length > 0) && !isStreaming && !disabled && !preparing;

  const submit = () => {
    if (!canSend) {
      return;
    }
    onSend(
      text.trim(),
      agentic,
      images.map((image) => ({ url: image.url })),
    );
    setText('');
    setImages([]);
    setAttachError(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div
      className="border-t border-white/10 bg-surface-dark px-4 py-3"
      onDrop={onDrop}
      onDragOver={(event) => event.preventDefault()}
    >
      <div className="mx-auto flex max-w-3xl flex-col">
        <div className="mb-2 flex items-center gap-2">
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
          {attachError && <span className="text-xs text-red-400">{attachError}</span>}
        </div>

        {(images.length > 0 || preparing) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((image, index) => (
              <div key={`${image.name}-${index}`} className="relative">
                <img
                  src={image.url}
                  alt={image.name}
                  className="h-16 w-16 rounded-lg object-cover ring-1 ring-white/15"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  aria-label={`Remove ${image.name}`}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-xs text-white ring-1 ring-white/20 hover:bg-black"
                >
                  ×
                </button>
              </div>
            ))}
            {preparing && (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg ring-1 ring-white/10">
                <Spinner size={16} />
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || images.length >= MAX_IMAGES}
            title="Attach image"
            aria-label="Attach image"
            className="rounded-xl px-3 py-3 text-base leading-none text-zinc-400 ring-1 ring-white/10 hover:text-zinc-100 disabled:opacity-40"
          >
            📎
          </button>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
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
            <Button onClick={submit} disabled={!canSend}>
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
