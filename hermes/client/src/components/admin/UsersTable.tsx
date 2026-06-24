import type { CSSProperties } from 'react';
import type { AdminUser } from '@hermes/shared';
import { Spinner } from '~/components/ui';
import { ACCENT, MONO, creditColor, creditPct, fmt, statusStyle } from './theme';
import { Avatar, Card } from './primitives';
import { ChevronRight } from './icons';

export type UserFilter = 'all' | 'low' | 'depleted' | 'suspended';

const GRID = '2.4fr 1.9fr 1.4fr 1fr 36px';

function isLow(u: AdminUser): boolean {
  return (
    u.credits.remaining > 0 &&
    u.credits.purchased > 0 &&
    u.credits.remaining / u.credits.purchased < 0.15
  );
}

function matchesFilter(u: AdminUser, filter: UserFilter): boolean {
  if (filter === 'low') {
    return isLow(u);
  }
  if (filter === 'depleted') {
    return u.credits.remaining <= 0;
  }
  if (filter === 'suspended') {
    return u.status === 'SUSPENDED';
  }
  return true;
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 13px',
    borderRadius: 9,
    fontSize: 12.5,
    fontWeight: 550,
    cursor: 'pointer',
    border: `1px solid ${active ? 'rgba(91,84,232,0.25)' : '#e8e8ec'}`,
    background: active ? 'rgba(91,84,232,0.08)' : '#fff',
    color: active ? ACCENT : '#52525b',
  };
  return (
    <button type="button" onClick={onClick} style={style}>
      {label} <span style={{ opacity: 0.6 }}>{count}</span>
    </button>
  );
}

export function UsersTable({
  users,
  isLoading,
  filter,
  onFilter,
  onOpenUser,
}: {
  users: AdminUser[];
  isLoading: boolean;
  filter: UserFilter;
  onFilter: (filter: UserFilter) => void;
  onOpenUser: (id: string) => void;
}): JSX.Element {
  const counts: Record<UserFilter, number> = {
    all: users.length,
    low: users.filter(isLow).length,
    depleted: users.filter((u) => u.credits.remaining <= 0).length,
    suspended: users.filter((u) => u.status === 'SUSPENDED').length,
  };
  const rows = users.filter((u) => matchesFilter(u, filter));

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <FilterChip label="All users" count={counts.all} active={filter === 'all'} onClick={() => onFilter('all')} />
        <FilterChip label="Low credit" count={counts.low} active={filter === 'low'} onClick={() => onFilter('low')} />
        <FilterChip
          label="Depleted"
          count={counts.depleted}
          active={filter === 'depleted'}
          onClick={() => onFilter('depleted')}
        />
        <FilterChip
          label="Suspended"
          count={counts.suspended}
          active={filter === 'suspended'}
          onClick={() => onFilter('suspended')}
        />
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
          <span>Credits remaining</span>
          <span>Agent model</span>
          <span>Status</span>
          <span />
        </div>

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: '#a1a1aa' }}>
            <Spinner size={20} />
          </div>
        )}
        {!isLoading && rows.length === 0 && (
          <div style={{ padding: 28, fontSize: 13, color: '#a1a1aa', textAlign: 'center' }}>
            No users match this view.
          </div>
        )}

        {rows.map((u) => {
          const color = creditColor(u.credits.remaining, u.credits.purchased);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => onOpenUser(u.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: 12,
                padding: '13px 20px',
                borderBottom: '1px solid #f4f4f6',
                cursor: 'pointer',
                alignItems: 'center',
                background: '#fff',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <Avatar seed={u.id} name={u.name} email={u.email} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
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
                      fontSize: 11.5,
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

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 550, color }}>
                    {u.credits.remaining.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 11, color: '#c4c4cc' }}>of {fmt(u.credits.purchased)}</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: '#f0f0f3', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${creditPct(u.credits)}%`,
                      background: color,
                      borderRadius: 3,
                      transition: 'width .3s',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: '#52525b',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {u.model}
              </div>

              <div>
                <span style={statusStyle(u.status)}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: u.status === 'ACTIVE' ? '#10b981' : '#dc2626',
                    }}
                  />
                  {u.status === 'ACTIVE' ? 'active' : 'suspended'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', color: '#c4c4cc' }}>
                <ChevronRight />
              </div>
            </button>
          );
        })}
      </Card>
    </>
  );
}
