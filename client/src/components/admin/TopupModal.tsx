import { useState } from 'react';
import type { AdminUser } from '@hermes/shared';
import { Spinner } from '~/components/ui';
import { ACCENT, MONO, fmt } from './theme';
import { ModalShell } from './ModalShell';

const OPTIONS: Array<{ credits: number; price: string }> = [
  { credits: 2000, price: '$20' },
  { credits: 10000, price: '$90' },
  { credits: 50000, price: '$400' },
];

export function TopupModal({
  user,
  isPending,
  onClose,
  onConfirm,
}: {
  user: AdminUser;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}): JSX.Element {
  const [selected, setSelected] = useState(1);
  const amount = OPTIONS[selected]!.credits;

  return (
    <ModalShell width={420} onClose={onClose}>
      <div style={{ padding: '22px 24px 0' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600 }}>Add credit</h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#a1a1aa' }}>
          Top up{' '}
          <span style={{ color: '#52525b', fontWeight: 500 }}>{user.name ?? user.email}</span>
          's balance. Charged to the workspace card.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginBottom: 16 }}>
          {OPTIONS.map((option, i) => {
            const active = selected === i;
            return (
              <button
                key={option.credits}
                type="button"
                onClick={() => setSelected(i)}
                style={{
                  textAlign: 'center',
                  padding: '13px 8px',
                  borderRadius: 11,
                  cursor: 'pointer',
                  border: `1.5px solid ${active ? ACCENT : '#e8e8ec'}`,
                  background: active ? 'rgba(91,84,232,0.05)' : '#fff',
                }}
              >
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 650, color: active ? ACCENT : '#27272a' }}>
                  {fmt(option.credits)}
                </div>
                <div style={{ fontSize: 11.5, color: '#a1a1aa', marginTop: 2 }}>{option.price}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ padding: '0 24px 22px', display: 'flex', gap: 9 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            background: '#fff',
            border: '1px solid #e2e2e7',
            borderRadius: 10,
            padding: 11,
            color: '#52525b',
            fontSize: 13.5,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => onConfirm(amount)}
          style={{
            flex: 1.4,
            background: ACCENT,
            border: 'none',
            borderRadius: 10,
            padding: 11,
            color: '#fff',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 3px 10px rgba(91,84,232,0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {isPending ? <Spinner size={15} /> : `Add ${fmt(amount)} credits`}
        </button>
      </div>
    </ModalShell>
  );
}
