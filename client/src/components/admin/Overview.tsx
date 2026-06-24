import type { ReactNode } from 'react';
import type { AdminOverview } from '@hermes/shared';
import { Spinner } from '~/components/ui';
import { ACCENT, MONO, creditColor, fmt, relativeTime } from './theme';
import { Avatar, Card } from './primitives';
import { RevenueIcon, ShieldIcon, TrendIcon, UsersIcon } from './icons';

function StatCard({
  icon,
  tint,
  color,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  tint: string;
  color: string;
  label: string;
  value: string;
  sub: string;
}): JSX.Element {
  return (
    <Card style={{ padding: '16px 17px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: tint,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
            flex: 'none',
          }}
        >
          {icon}
        </span>
        <span style={{ fontSize: 12.5, color: '#71717a', fontWeight: 500 }}>{label}</span>
      </div>
      <div
        style={{
          fontSize: 25,
          fontWeight: 650,
          letterSpacing: '-0.02em',
          color: '#18181b',
          fontFamily: MONO,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 4, fontWeight: 500 }}>{sub}</div>
    </Card>
  );
}

export function Overview({
  data,
  isLoading,
  onOpenUser,
}: {
  data: AdminOverview | undefined;
  isLoading: boolean;
  onOpenUser: (id: string) => void;
}): JSX.Element {
  if (isLoading || !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48, color: '#a1a1aa' }}>
        <Spinner size={22} />
      </div>
    );
  }

  const maxBar = Math.max(1, ...data.chart.map((p) => p.credits));

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
        <StatCard
          icon={<UsersIcon />}
          tint="rgba(91,84,232,0.1)"
          color={ACCENT}
          label="Total users"
          value={String(data.totalUsers)}
          sub={`${data.activeUsers} active`}
        />
        <StatCard
          icon={<ShieldIcon size={16} />}
          tint="rgba(16,185,129,0.1)"
          color="#059669"
          label="Active agents"
          value={String(data.activeUsers)}
          sub={`${data.needsAttention} need attention`}
        />
        <StatCard
          icon={<TrendIcon />}
          tint="rgba(14,165,233,0.1)"
          color="#0284c7"
          label="Credits used"
          value={fmt(data.creditsUsed)}
          sub="across all agents"
        />
        <StatCard
          icon={<RevenueIcon />}
          tint="rgba(139,92,246,0.1)"
          color="#7c3aed"
          label="Credits remaining"
          value={fmt(data.creditsRemaining)}
          sub={`${fmt(data.creditsSold)} sold`}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 14 }}>
        <Card style={{ padding: '18px 20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18,
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Credit consumption</h3>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#a1a1aa' }}>
                Credits used · last 14 days
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140 }}>
            {data.chart.map((point, i) => (
              <div
                key={point.label + i}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  height: '100%',
                  justifyContent: 'flex-end',
                }}
              >
                <div
                  title={`${point.label} · ${point.credits.toLocaleString()} credits · ${point.messages} replies`}
                  style={{
                    width: '100%',
                    borderRadius: '5px 5px 0 0',
                    background:
                      i === data.chart.length - 1 ? ACCENT : 'rgba(91,84,232,0.28)',
                    height: `${Math.max(2, Math.round((point.credits / maxBar) * 100))}%`,
                    transition: 'height .3s',
                  }}
                />
                <span style={{ fontSize: 9, color: '#c4c4cc' }}>{i % 2 === 0 ? point.label.split(' ')[1] : ''}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: '18px 20px' }}>
          <h3 style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 600 }}>Needs attention</h3>
          <p style={{ margin: '0 0 15px', fontSize: 11.5, color: '#a1a1aa' }}>
            Low or depleted credit balances
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.alerts.length === 0 && (
              <p style={{ fontSize: 12.5, color: '#a1a1aa' }}>Everyone has healthy credit.</p>
            )}
            {data.alerts.map((user) => {
              const depleted = user.credits.remaining <= 0;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => onOpenUser(user.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '9px 10px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    border: '1px solid #f0f0f3',
                    background: '#fff',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <Avatar seed={user.id} name={user.name} email={user.email} size={30} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 550,
                        color: '#27272a',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {user.name ?? user.email}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        color: creditColor(user.credits.remaining, user.credits.purchased),
                      }}
                    >
                      {user.credits.remaining.toLocaleString()} credits left
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 6,
                      flex: 'none',
                      background: depleted ? 'rgba(220,38,38,0.1)' : 'rgba(217,119,6,0.1)',
                      color: depleted ? '#dc2626' : '#d97706',
                    }}
                  >
                    {depleted ? 'Depleted' : 'Low'}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <Card style={{ padding: '18px 20px', marginTop: 14 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Recent agent activity</h3>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {data.activity.length === 0 && (
            <p style={{ fontSize: 13, color: '#a1a1aa' }}>No activity yet.</p>
          )}
          {data.activity.map((event) => (
            <div
              key={event.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '9px 0',
                borderBottom: '1px solid #f4f4f6',
              }}
            >
              <Avatar seed={event.userId} name={event.userName} email={event.userName} size={26} />
              <span style={{ fontSize: 13, color: '#3f3f46', flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 550, color: '#18181b' }}>{event.userName}</span>{' '}
                {event.action}
              </span>
              <span style={{ fontSize: 11.5, color: '#a1a1aa', flex: 'none' }}>
                {relativeTime(event.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
