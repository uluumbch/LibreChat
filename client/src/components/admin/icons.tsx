type IconProps = { size?: number; className?: string; style?: React.CSSProperties };

function stroke(size: number, children: React.ReactNode, style?: React.CSSProperties): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const OverviewIcon = ({ size = 16 }: IconProps): JSX.Element =>
  stroke(
    size,
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </>,
  );

export const UsersIcon = ({ size = 16 }: IconProps): JSX.Element =>
  stroke(
    size,
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5M18 20c0-2.5-1-4-2.5-4.7" />
    </>,
  );

export const CreditsIcon = ({ size = 16 }: IconProps): JSX.Element =>
  stroke(
    size,
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </>,
  );

export const ClockIcon = ({ size = 16 }: IconProps): JSX.Element =>
  stroke(
    size,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  );

export const ShieldIcon = ({ size = 15, style }: IconProps): JSX.Element =>
  stroke(size, <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5Z" />, style);

export const PlugIcon = ({ size = 16, style }: IconProps): JSX.Element =>
  stroke(
    size,
    <>
      <path d="M9 2v6M15 2v6" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" />
      <path d="M12 17v5" />
    </>,
    style,
  );

export const SearchIcon = ({ size = 14 }: IconProps): JSX.Element =>
  stroke(
    size,
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </>,
  );

export const ChevronRight = ({ size = 16 }: IconProps): JSX.Element =>
  stroke(size, <path d="M9 6l6 6-6 6" />);

export const ChevronDown = ({ size = 14, style }: IconProps): JSX.Element =>
  stroke(size, <path d="M5 9l7 7 7-7" />, style);

export const CloseIcon = ({ size = 17 }: IconProps): JSX.Element =>
  stroke(size, <path d="M18 6L6 18M6 6l12 12" />);

export const CheckIcon = ({ size = 15 }: IconProps): JSX.Element =>
  stroke(size, <path d="M20 6L9 17l-5-5" />);

export const PlayIcon = ({ size = 13 }: IconProps): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);

export const TrendIcon = ({ size = 16 }: IconProps): JSX.Element =>
  stroke(
    size,
    <>
      <path d="M3 17l5-6 4 3 6-8" />
      <path d="M16 6h4v4" />
    </>,
  );

export const RevenueIcon = ({ size = 16 }: IconProps): JSX.Element =>
  stroke(size, <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />);
