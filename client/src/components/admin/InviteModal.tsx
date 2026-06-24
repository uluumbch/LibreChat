import { useState } from 'react';
import type { InviteUserRequest } from '@hermes/shared';
import { Spinner } from '~/components/ui';
import { useModels } from '~/data/queries';
import { ACCENT, MONO } from './theme';
import { ModalShell } from './ModalShell';

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#fafafb',
  border: '1px solid #e2e2e7',
  borderRadius: 10,
  padding: '10px 12px',
  color: '#18181b',
  fontSize: 13.5,
  outline: 'none',
};

export function InviteModal({
  isPending,
  error,
  onClose,
  onSend,
}: {
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onSend: (input: InviteUserRequest) => void;
}): JSX.Element {
  const modelsQuery = useModels();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [credits, setCredits] = useState('2000');
  const [model, setModel] = useState('');
  const [instructions, setInstructions] = useState('');

  const modelOptions = modelsQuery.data?.items.map((m) => m.id) ?? [];

  const submit = () => {
    const trimmed = email.trim();
    if (!trimmed) {
      return;
    }
    const startingCredits = Number(credits.replace(/[^0-9]/g, ''));
    onSend({
      email: trimmed,
      name: name.trim() || undefined,
      startingCredits: Number.isFinite(startingCredits) ? startingCredits : undefined,
      model: model || undefined,
      instructions: instructions.trim() ? instructions.trim() : undefined,
    });
  };

  return (
    <ModalShell width={440} onClose={onClose}>
      <div style={{ padding: '22px 24px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600 }}>Invite user</h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#a1a1aa' }}>
          They'll get an agent profile with the starter credit grant.
        </p>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: '#3f3f46', marginBottom: 6 }}>
          Email
        </label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          style={{ ...inputStyle, marginBottom: 14 }}
        />

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: '#3f3f46', marginBottom: 6 }}>
          Name <span style={{ color: '#a1a1aa', fontWeight: 400 }}>(optional)</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
          style={{ ...inputStyle, marginBottom: 14 }}
        />

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: '#3f3f46', marginBottom: 6 }}>
          Starting credit grant
        </label>
        <input
          value={credits}
          onChange={(e) => setCredits(e.target.value)}
          style={{ ...inputStyle, fontFamily: MONO }}
        />
        <p style={{ margin: '7px 0 14px', fontSize: 11.5, color: '#a1a1aa' }}>
          A free starter grant to get going. They top up to add more.
        </p>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: '#3f3f46', marginBottom: 6 }}>
          Model <span style={{ color: '#a1a1aa', fontWeight: 400 }}>(optional)</span>
        </label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={{ ...inputStyle, fontFamily: MONO, marginBottom: 14, cursor: 'pointer' }}
        >
          <option value="">Default model</option>
          {modelOptions.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: '#3f3f46', marginBottom: 6 }}>
          Persona &amp; instructions <span style={{ color: '#a1a1aa', fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="System instructions for this user's agent…"
          style={{ ...inputStyle, height: 72, resize: 'none', lineHeight: 1.5, fontFamily: 'inherit' }}
        />

        {error && <p style={{ margin: '10px 0 0', fontSize: 12, color: '#dc2626' }}>{error}</p>}
      </div>
      <div style={{ padding: '0 24px 22px', display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: '#fff',
            border: '1px solid #e2e2e7',
            borderRadius: 10,
            padding: '10px 16px',
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
          disabled={isPending || email.trim().length === 0}
          onClick={submit}
          style={{
            background: ACCENT,
            border: 'none',
            borderRadius: 10,
            padding: '10px 18px',
            color: '#fff',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 3px 10px rgba(91,84,232,0.28)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: email.trim().length === 0 ? 0.6 : 1,
          }}
        >
          {isPending ? <Spinner size={15} /> : 'Send invite'}
        </button>
      </div>
    </ModalShell>
  );
}
