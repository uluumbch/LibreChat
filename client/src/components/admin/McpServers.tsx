import { useState } from 'react';
import type { CreateMcpServerRequest } from '@hermes/shared';
import { Spinner } from '~/components/ui';
import { ApiError } from '~/api/client';
import { useCreateMcpServer, useDeleteMcpServer, useMcpServers } from '~/data/queries';
import { ACCENT, MONO } from './theme';
import { Card } from './primitives';
import { McpServerModal } from './McpServerModal';

export function McpServers({ onFlash }: { onFlash: (msg: string) => void }): JSX.Element {
  const { data, isLoading } = useMcpServers();
  const create = useCreateMcpServer();
  const remove = useDeleteMcpServer();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const servers = data?.items ?? [];

  const submit = async (input: CreateMcpServerRequest) => {
    setError(null);
    try {
      await create.mutateAsync(input);
      setOpen(false);
      onFlash(`Added MCP server "${input.name}"`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add server');
    }
  };

  const onRemove = async (name: string) => {
    await remove.mutateAsync(name);
    onFlash(`Removed "${name}"`);
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
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>MCP servers</h3>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#a1a1aa' }}>
              Global remote connectors · available to all users, restrict per user from their drawer
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setOpen(true);
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
            <span style={{ fontSize: 15, lineHeight: 1, marginTop: -1 }}>+</span> Add MCP server
          </button>
        </div>

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: '#a1a1aa' }}>
            <Spinner size={20} />
          </div>
        )}

        {!isLoading && servers.length === 0 && (
          <div style={{ padding: '32px 18px', fontSize: 13, color: '#a1a1aa', textAlign: 'center' }}>
            No MCP servers configured. Add a remote (https) MCP server to give agents extra tools.
          </div>
        )}

        {servers.map((srv, i) => (
          <div
            key={srv.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              padding: '13px 18px',
              borderBottom: i === servers.length - 1 ? 'none' : '1px solid #f4f4f6',
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: 'rgba(91,84,232,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: MONO,
                fontSize: 12,
                fontWeight: 600,
                color: ACCENT,
                flex: 'none',
              }}
            >
              {srv.name.slice(0, 2).toUpperCase()}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: '#18181b' }}>{srv.name}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: 5,
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                    background: srv.connected ? 'rgba(16,185,129,0.12)' : 'rgba(161,161,170,0.14)',
                    color: srv.connected ? '#059669' : '#71717a',
                  }}
                >
                  {srv.connected ? 'connected' : 'offline'}
                </span>
                <span style={{ fontSize: 10.5, color: '#a1a1aa', textTransform: 'uppercase' }}>{srv.transport}</span>
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: '#a1a1aa',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: 2,
                }}
              >
                {srv.url}
                {Object.keys(srv.headersMasked).length > 0 &&
                  ` · ${Object.keys(srv.headersMasked).join(', ')}`}
              </div>
            </div>
            <button
              type="button"
              disabled={remove.isPending && remove.variables === srv.name}
              onClick={() => void onRemove(srv.name)}
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
              {remove.isPending && remove.variables === srv.name ? <Spinner size={13} /> : 'Remove'}
            </button>
          </div>
        ))}
      </Card>

      {open && (
        <McpServerModal
          isPending={create.isPending}
          error={error}
          onClose={() => setOpen(false)}
          onSubmit={(input) => void submit(input)}
        />
      )}
    </>
  );
}
