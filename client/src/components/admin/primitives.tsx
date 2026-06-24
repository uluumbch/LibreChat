import type { CSSProperties, ReactNode } from 'react';
import { avatarFor, initials } from './theme';

export function Avatar({
  seed,
  name,
  email,
  size = 32,
}: {
  seed: string;
  name: string | null;
  email: string;
  size?: number;
}): JSX.Element {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: avatarFor(seed),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.375,
        fontWeight: 600,
        color: '#fff',
        flex: 'none',
      }}
      aria-hidden="true"
    >
      {initials(name, email)}
    </span>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}): JSX.Element {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #ebebef',
        borderRadius: 14,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
