import type { CSSProperties } from 'react';
import type { AccountStatus, CreditBalance } from '@hermes/shared';

/** The admin panel is a self-contained light surface; these are its core tokens. */
export const ACCENT = '#5b54e8';
export const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const AVATAR_PALETTE = [
  'linear-gradient(140deg,#6d66f0,#9333ea)',
  'linear-gradient(140deg,#0ea5e9,#2563eb)',
  'linear-gradient(140deg,#10b981,#059669)',
  'linear-gradient(140deg,#f59e0b,#d97706)',
  'linear-gradient(140deg,#ec4899,#be185d)',
  'linear-gradient(140deg,#8b5cf6,#6d28d9)',
  'linear-gradient(140deg,#14b8a6,#0d9488)',
  'linear-gradient(140deg,#f43f5e,#e11d48)',
];

/** Deterministic gradient per seed (user id), so avatars stay stable across renders. */
export function avatarFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!;
}

export function initials(name: string | null, fallback: string): string {
  const source = name?.trim() || fallback;
  return source
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Compact credit notation: 1240 → "1.2k", 84200 → "84.2k". */
export function fmt(n: number): string {
  if (n < 1000) {
    return String(n);
  }
  return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'k';
}

/** Red when depleted/low, amber when getting low, green otherwise. */
export function creditColor(remaining: number, purchased: number): string {
  if (remaining <= 0) {
    return '#dc2626';
  }
  const ratio = purchased > 0 ? remaining / purchased : 0;
  if (ratio < 0.15) {
    return '#dc2626';
  }
  if (ratio < 0.35) {
    return '#d97706';
  }
  return '#059669';
}

export function creditPct(balance: CreditBalance): number {
  if (balance.purchased <= 0) {
    return 0;
  }
  return Math.max(2, Math.round((balance.remaining / balance.purchased) * 100));
}

export function statusStyle(status: AccountStatus): CSSProperties {
  const active = status === 'ACTIVE';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11.5,
    fontWeight: 550,
    padding: '3px 9px',
    borderRadius: 7,
    textTransform: 'capitalize',
    color: active ? '#059669' : '#dc2626',
    background: active ? 'rgba(16,185,129,0.1)' : 'rgba(220,38,38,0.08)',
  };
}

export function jobBadgeStyle(enabled: boolean): CSSProperties {
  return {
    fontSize: 10.5,
    fontWeight: 600,
    padding: '3px 9px',
    borderRadius: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    color: enabled ? '#059669' : '#a1a1aa',
    background: enabled ? 'rgba(16,185,129,0.1)' : '#f4f4f6',
  };
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) {
    return 'just now';
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hours = Math.round(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
}

/** Hermes cron emits ISO-8601 timestamps; render relative-to-now. */
export function jobWhen(ts?: string | null): string {
  if (!ts) {
    return '—';
  }
  const diff = new Date(ts).getTime() - Date.now();
  if (diff <= 0) {
    return 'due';
  }
  const mins = Math.round(diff / 60000);
  if (mins < 60) {
    return `in ${mins}m`;
  }
  const hours = Math.round(mins / 60);
  if (hours < 24) {
    return `in ${hours}h`;
  }
  return `in ${Math.round(hours / 24)}d`;
}
