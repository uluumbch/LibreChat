import { useState } from 'react';
import type { AdminComposioToolkit } from '@hermes/shared';
import { Spinner } from '~/components/ui';
import { useComposioAdminToolkits, useToggleComposioToolkit } from '~/data/queries';
import { ACCENT, MONO } from './theme';
import { Card } from './primitives';

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        cursor: disabled ? 'default' : 'pointer',
        position: 'relative',
        transition: 'background .2s',
        flex: 'none',
        border: 'none',
        padding: 0,
        opacity: disabled ? 0.6 : 1,
        background: on ? ACCENT : '#d4d4d8',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2.5,
          left: on ? 18.5 : 2.5,
          width: 17,
          height: 17,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .2s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}

export function ComposioToolkits({ onFlash }: { onFlash: (msg: string) => void }): JSX.Element {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useComposioAdminToolkits(query);
  const toggle = useToggleComposioToolkit();
  const [confirm, setConfirm] = useState<AdminComposioToolkit | null>(null);

  const items = data?.items ?? [];

  const doToggle = async (t: AdminComposioToolkit, enabled: boolean) => {
    await toggle.mutateAsync({ slug: t.slug, enabled, name: t.name });
    onFlash(enabled ? `Enabled ${t.name}` : `Disabled ${t.name}`);
  };

  const onToggleClick = (t: AdminComposioToolkit) => {
    // Disabling an enabled toolkit that users depend on needs a warning first.
    if (t.enabled && t.userCount > 0) {
      setConfirm(t);
      return;
    }
    void doToggle(t, !t.enabled);
  };

  const confirmDisable = async () => {
    if (!confirm) return;
    const t = confirm;
    setConfirm(null);
    await doToggle(t, false);
  };

  return (
    <>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '15px 18px', borderBottom: '1px solid #f0f0f3' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Composio toolkits</h3>
          <p style={{ margin: '2px 0 12px', fontSize: 11.5, color: '#a1a1aa' }}>
            Enable third-party apps for the workspace. Enabled apps become grantable per user.
          </p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Composio apps… (e.g. gmail, slack, github)"
            style={{
              width: '100%',
              background: '#f4f4f6',
              border: '1px solid #e8e8ec',
              borderRadius: 9,
              padding: '9px 12px',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        {data && !data.configured && (
          <div style={{ padding: '28px 18px', fontSize: 13, color: '#a1a1aa', textAlign: 'center' }}>
            Composio is not configured on this server (set COMPOSIO_API_KEY).
          </div>
        )}

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: '#a1a1aa' }}>
            <Spinner size={20} />
          </div>
        )}

        {!isLoading && data?.configured && items.length === 0 && (
          <div style={{ padding: '28px 18px', fontSize: 13, color: '#a1a1aa', textAlign: 'center' }}>
            No apps match “{query}”.
          </div>
        )}

        {items.map((t, i) => {
          const pending = toggle.isPending && toggle.variables?.slug === t.slug;
          return (
            <div
              key={t.slug}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                padding: '13px 18px',
                borderBottom: i === items.length - 1 ? 'none' : '1px solid #f4f4f6',
              }}
            >
              {t.logo ? (
                <img
                  src={t.logo}
                  alt=""
                  width={34}
                  height={34}
                  style={{ borderRadius: 9, flex: 'none', objectFit: 'contain', background: '#fafafb' }}
                />
              ) : (
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
                  {t.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: '#18181b' }}>{t.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: '#a1a1aa' }}>{t.slug}</span>
                  {t.enabled && t.userCount > 0 && (
                    <span style={{ fontSize: 10.5, color: '#a1a1aa' }}>
                      · {t.userCount} user{t.userCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {t.description && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: '#a1a1aa',
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 560,
                    }}
                  >
                    {t.description}
                  </div>
                )}
              </div>
              {pending ? (
                <Spinner size={16} />
              ) : (
                <Toggle on={t.enabled} onClick={() => onToggleClick(t)} />
              )}
            </div>
          );
        })}
      </Card>

      {confirm && (
        <div
          role="presentation"
          onClick={() => setConfirm(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(24,24,27,0.4)',
            backdropFilter: 'blur(2px)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 420,
              maxWidth: '92vw',
              background: '#fff',
              borderRadius: 14,
              padding: 22,
              boxShadow: '0 24px 70px rgba(0,0,0,0.25)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 15.5, fontWeight: 650 }}>Disable {confirm.name}?</h3>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: '#52525b', lineHeight: 1.55 }}>
              <strong>{confirm.userCount}</strong> user{confirm.userCount === 1 ? ' is' : 's are'} granted{' '}
              {confirm.name}. Disabling it revokes their access and{' '}
              <strong>disconnects their connected accounts</strong>. They&apos;d have to reconnect if you
              re-enable it later.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
              <button
                type="button"
                onClick={() => setConfirm(null)}
                style={{
                  background: '#fff',
                  border: '1px solid #e2e2e7',
                  borderRadius: 10,
                  padding: '9px 15px',
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: '#52525b',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDisable()}
                style={{
                  background: '#dc2626',
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 15px',
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Disable &amp; disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
