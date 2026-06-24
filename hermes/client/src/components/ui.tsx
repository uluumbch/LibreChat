import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

/** The Hermes mark: a gradient rounded square with the partial-ring glyph. */
export function BrandMark({ size = 28, radius = 8 }: { size?: number; radius?: number }): JSX.Element {
  const ring = Math.round(size * 0.36);
  return (
    <div
      className="flex flex-none items-center justify-center bg-gradient-to-br from-brand to-brand-dark shadow-brand"
      style={{ width: size, height: size, borderRadius: radius }}
      aria-hidden="true"
    >
      <div
        style={{
          width: ring,
          height: ring,
          borderRadius: '50%',
          border: `${Math.max(2, Math.round(size / 14))}px solid #fff`,
          borderRightColor: 'transparent',
          transform: 'rotate(35deg)',
        }}
      />
    </div>
  );
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={clsx('animate-spin', className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
};

export function Button({ className, variant = 'primary', ...props }: ButtonProps): JSX.Element {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-brand text-white shadow-brand hover:bg-brand-dark',
        variant === 'ghost' &&
          'border border-black/10 bg-white text-ink-soft hover:bg-surface-input',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-500',
        className,
      )}
      {...props}
    />
  );
}
