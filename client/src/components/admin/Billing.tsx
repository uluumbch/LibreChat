import type { AdminUser } from '@hermes/shared';
import { Spinner } from '~/components/ui';
import { ACCENT, MONO, creditColor, fmt } from './theme';
import { Avatar, Card } from './primitives';

const GRID = '2fr 1.3fr 1.3fr 1.3fr 1.2fr 110px';

function shortDate(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SummaryCard({
  name,
  count,
  sub,
  highlight,
}: {
  name: string;
  count: string;
  sub: string;
  highlight?: boolean;
}): JSX.Element {
  return (
    <Card style={{ padding: '16px 17px', border: `1px solid ${highlight ? 'rgba(91,84,232,0.25)' : '#ebebef'}` }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b', marginBottom: 9 }}>{name}</div>
      <div style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-0.02em', fontFamily: MONO }}>{count}</div>
      <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 3 }}>{sub}</div>
    </Card>
  );
}

export function Billing({
  users,
  isLoading,
  onTopup,
}: {
  users: AdminUser[];
  isLoading: boolean;
  onTopup: (user: AdminUser) => void;
}): JSX.Element {
  const sold = users.reduce((s, u) => s + u.credits.purchased, 0);
  const remaining = users.reduce((s, u) => s + u.credits.remaining, 0);
  const used = users.reduce((s, u) => s + u.credits.used, 0);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 18 }}>
        <SummaryCard name="Credits sold" count={fmt(sold)} sub="lifetime, all users" highlight />
        <SummaryCard name="Credits remaining" count={fmt(remaining)} sub="available to spend" />
        <SummaryCard name="Credits used" count={fmt(used)} sub="across all agents" />
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: GRID,
            gap: 12,
            padding: '11px 20px',
            borderBottom: '1px solid #ebebef',
            background: '#fafafb',
            fontSize: 11,
            color: '#a1a1aa',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <span>User</span>
          <span>Purchased</span>
          <span>Used</span>
          <span>Remaining</span>
          <span>Last top-up</span>
          <span />
        </div>

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: '#a1a1aa' }}>
            <Spinner size={20} />
          </div>
        )}

        {users.map((u) => (
          <div
            key={u.id}
            style={{
              display: 'grid',
              gridTemplateColumns: GRID,
              gap: 12,
              padding: '13px 20px',
              borderBottom: '1px solid #f4f4f6',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              <Avatar seed={u.id} name={u.name} email={u.email} size={30} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 550,
                    color: '#27272a',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {u.name ?? u.email}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: '#a1a1aa',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {u.email}
                </div>
              </div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12.5, color: '#52525b' }}>
              {u.credits.purchased.toLocaleString()}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12.5, color: '#3f3f46' }}>
              {u.credits.used.toLocaleString()}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 12.5,
                fontWeight: 550,
                color: creditColor(u.credits.remaining, u.credits.purchased),
              }}
            >
              {u.credits.remaining.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: '#71717a' }}>{shortDate(u.credits.lastTopupAt)}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => onTopup(u)}
                style={{
                  background: 'rgba(91,84,232,0.08)',
                  border: '1px solid rgba(91,84,232,0.2)',
                  borderRadius: 8,
                  padding: '6px 12px',
                  color: ACCENT,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Add credit
              </button>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
