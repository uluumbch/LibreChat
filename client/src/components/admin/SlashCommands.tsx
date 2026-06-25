import { useState } from 'react';
import type { AdminSlashCommand, SlashCommandType, UpsertSlashCommandRequest } from '@hermes/shared';
import { Spinner } from '~/components/ui';
import { ApiError } from '~/api/client';
import { useAdminCommands, useDeleteSlashCommand, useUpsertSlashCommand } from '~/data/queries';
import { ACCENT, MONO } from './theme';
import { Card } from './primitives';
import { SlashCommandModal } from './SlashCommandModal';

const TYPE_BADGE: Record<SlashCommandType, { label: string; bg: string; fg: string }> = {
  prompt: { label: 'prompt', bg: 'rgba(91,84,232,0.1)', fg: ACCENT },
  skill_scope: { label: 'scope', bg: 'rgba(16,185,129,0.12)', fg: '#059669' },
  server_action: { label: 'action', bg: 'rgba(245,158,11,0.14)', fg: '#b45309' },
};

export function SlashCommands({ onFlash }: { onFlash: (msg: string) => void }): JSX.Element {
  const { data, isLoading } = useAdminCommands();
  const upsert = useUpsertSlashCommand();
  const remove = useDeleteSlashCommand();
  const [modal, setModal] = useState<{ open: boolean; existing: AdminSlashCommand | null }>({
    open: false,
    existing: null,
  });
  const [error, setError] = useState<string | null>(null);

  const items = data?.items ?? [];

  const submit = async (input: UpsertSlashCommandRequest) => {
    setError(null);
    try {
      await upsert.mutateAsync(input);
      setModal({ open: false, existing: null });
      onFlash(input.id ? `Saved /${input.name}` : `Created /${input.name}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save command');
    }
  };

  const toggleEnabled = async (cmd: AdminSlashCommand) => {
    await upsert.mutateAsync({
      id: cmd.id,
      name: cmd.name,
      description: cmd.description,
      type: cmd.type,
      enabled: !cmd.enabled,
      promptTemplate: cmd.promptTemplate,
      promptPrefix: cmd.promptPrefix,
      scopeToolsets: cmd.scopeToolsets,
      scopeSkills: cmd.scopeSkills,
      actionKey: cmd.actionKey,
    });
    onFlash(cmd.enabled ? `Disabled /${cmd.name}` : `Enabled /${cmd.name}`);
  };

  const onRemove = async (cmd: AdminSlashCommand) => {
    await remove.mutateAsync(cmd.id);
    onFlash(`Deleted /${cmd.name}`);
  };

  return (
    <>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '15px 18px',
            borderBottom: '1px solid #f0f0f3',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Slash commands</h3>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#a1a1aa' }}>
              Curated `/` commands for the composer · enabled ones are usable by all users
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setModal({ open: true, existing: null });
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: ACCENT,
              border: 'none',
              borderRadius: 9,
              padding: '9px 14px',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 3px 10px rgba(91,84,232,0.28)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1, marginTop: -1 }}>+</span> New command
          </button>
        </div>

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: '#a1a1aa' }}>
            <Spinner size={20} />
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div style={{ padding: '32px 18px', fontSize: 13, color: '#a1a1aa', textAlign: 'center' }}>
            No slash commands yet. Create one to give users quick prompts, scoped tools, or canned replies.
          </div>
        )}

        {items.map((cmd, i) => {
          const badge = TYPE_BADGE[cmd.type];
          return (
            <div
              key={cmd.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                padding: '13px 18px',
                borderBottom: i === items.length - 1 ? 'none' : '1px solid #f4f4f6',
                opacity: cmd.enabled ? 1 : 0.55,
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: badge.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: MONO,
                  fontSize: 14,
                  fontWeight: 700,
                  color: badge.fg,
                  flex: 'none',
                }}
              >
                /
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 600, color: '#18181b' }}>
                    /{cmd.name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: 5,
                      background: badge.bg,
                      color: badge.fg,
                    }}
                  >
                    {badge.label}
                  </span>
                  {cmd.grantCount > 0 && (
                    <span style={{ fontSize: 10.5, color: '#a1a1aa' }}>
                      · {cmd.grantCount} user{cmd.grantCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: '#a1a1aa',
                    marginTop: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 520,
                  }}
                >
                  {cmd.description}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void toggleEnabled(cmd)}
                style={{
                  background: '#fff',
                  border: '1px solid #e2e2e7',
                  borderRadius: 9,
                  padding: '7px 12px',
                  color: '#52525b',
                  fontSize: 12.5,
                  fontWeight: 550,
                  cursor: 'pointer',
                  flex: 'none',
                }}
              >
                {cmd.enabled ? 'Disable' : 'Enable'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setModal({ open: true, existing: cmd });
                }}
                style={{
                  background: '#fff',
                  border: '1px solid #e2e2e7',
                  borderRadius: 9,
                  padding: '7px 12px',
                  color: '#52525b',
                  fontSize: 12.5,
                  fontWeight: 550,
                  cursor: 'pointer',
                  flex: 'none',
                }}
              >
                Edit
              </button>
              <button
                type="button"
                disabled={remove.isPending && remove.variables === cmd.id}
                onClick={() => void onRemove(cmd)}
                style={{
                  background: '#fff',
                  border: '1px solid rgba(220,38,38,0.25)',
                  borderRadius: 9,
                  padding: '7px 12px',
                  color: '#dc2626',
                  fontSize: 12.5,
                  fontWeight: 550,
                  cursor: 'pointer',
                  flex: 'none',
                }}
              >
                {remove.isPending && remove.variables === cmd.id ? <Spinner size={13} /> : 'Delete'}
              </button>
            </div>
          );
        })}
      </Card>

      {modal.open && (
        <SlashCommandModal
          existing={modal.existing}
          isPending={upsert.isPending}
          error={error}
          onClose={() => setModal({ open: false, existing: null })}
          onSubmit={(input) => void submit(input)}
        />
      )}
    </>
  );
}
