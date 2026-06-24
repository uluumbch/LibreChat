import { useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, DragEvent, KeyboardEvent } from 'react';
import clsx from 'clsx';
import type { ChatImageInput } from '@hermes/shared';
import { Spinner } from '~/components/ui';
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
      className="flex-none px-6 pb-[18px]"
      onDrop={onDrop}
      onDragOver={(event) => event.preventDefault()}
    >
      <div className="mx-auto max-w-[768px]">
        <div className="mb-2.5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleAgentic}
            title="Pause for approval before risky tools, and show reasoning."
            aria-pressed={agentic}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition',
              agentic
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
                : 'border-black/10 bg-white text-ink-muted hover:text-ink-soft',
            )}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5Z" />
            </svg>
            {agentic ? 'Agentic: on' : 'Agentic: off'}
          </button>
          {attachError ? (
            <span className="text-[11.5px] text-red-600">{attachError}</span>
          ) : (
            <span className="hidden text-[11.5px] text-ink-faint sm:inline">
              Pauses for approval before risky tools, and shows reasoning.
            </span>
          )}
        </div>

        <div className="rounded-[16px] border border-black/[0.09] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/10">
          {(images.length > 0 || preparing) && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {images.map((image, index) => (
                <div key={`${image.name}-${index}`} className="relative">
                  <img
                    src={image.url}
                    alt={image.name}
                    className="h-[54px] w-[54px] rounded-[9px] border border-black/10 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    aria-label={`Remove ${image.name}`}
                    className="absolute -right-1.5 -top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-black/20 bg-surface-input text-[11px] text-ink-soft hover:bg-zinc-200"
                  >
                    ×
                  </button>
                </div>
              ))}
              {preparing && (
                <div className="flex h-[54px] w-[54px] items-center justify-center rounded-[9px] border border-black/10 text-ink-faint">
                  <Spinner size={16} />
                </div>
              )}
            </div>
          )}

          <div className="flex items-end gap-2 py-2.5 pl-3 pr-2.5">
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
              className="mb-px flex h-8 w-8 flex-none items-center justify-center rounded-[9px] text-ink-muted transition hover:bg-surface-input hover:text-ink-soft disabled:opacity-40"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15l-5-5L5 21" />
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
              </svg>
            </button>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              rows={1}
              placeholder="Message Hermes…"
              disabled={disabled}
              className="max-h-40 flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint disabled:opacity-60"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop"
                className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-red-600 shadow-[0_4px_14px_rgba(242,107,114,0.35)] transition hover:bg-red-500"
              >
                <span className="h-[11px] w-[11px] rounded-[2px] bg-white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!canSend}
                aria-label="Send"
                className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-brand text-white shadow-brand transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
