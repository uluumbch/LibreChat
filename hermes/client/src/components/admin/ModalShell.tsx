import type { ReactNode } from 'react';

/** Centered modal with a dimmed, click-to-dismiss backdrop. */
export function ModalShell({
  width,
  onClose,
  children,
}: {
  width: number;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(24,24,27,0.4)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 70,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{
          width,
          maxWidth: '92vw',
          background: '#fff',
          borderRadius: 18,
          boxShadow: '0 30px 80px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          color: '#18181b',
        }}
      >
        {children}
      </div>
    </div>
  );
}
