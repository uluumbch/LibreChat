import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import type { UserSlashCommand } from '@hermes/shared';

const TYPE_LABEL: Record<UserSlashCommand['type'], string> = {
  prompt: 'prompt',
  skill_scope: 'scope',
  server_action: 'action',
};

/**
 * Autocomplete popup for curated slash commands, shown above the composer when the user
 * types `/`. Presentational: the parent owns filtering, selection, and keyboard handling.
 */
export function SlashCommandMenu({
  items,
  selectedIndex,
  onPick,
}: {
  items: UserSlashCommand[];
  selectedIndex: number;
  onPick: (command: UserSlashCommand) => void;
}): JSX.Element {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-[12px] border border-black/[0.09] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
      <div className="max-h-[260px] overflow-y-auto py-1">
        {items.map((command, index) => (
          <button
            key={command.name}
            ref={index === selectedIndex ? activeRef : undefined}
            type="button"
            // Use onMouseDown so picking doesn't blur the textarea before the click lands.
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(command);
            }}
            className={clsx(
              'flex w-full items-center gap-2.5 px-3 py-2 text-left transition',
              index === selectedIndex ? 'bg-brand/[0.08]' : 'hover:bg-black/[0.03]',
            )}
          >
            <span className="font-mono text-[13px] font-semibold text-brand">/{command.name}</span>
            <span className="flex-1 truncate text-[12.5px] text-ink-muted">{command.description}</span>
            <span className="flex-none rounded-full bg-black/[0.05] px-2 py-0.5 text-[10.5px] font-medium text-ink-faint">
              {TYPE_LABEL[command.type]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
