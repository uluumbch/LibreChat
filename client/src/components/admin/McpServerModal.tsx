import { useState } from 'react';
import type { CreateMcpServerRequest } from '@hermes/shared';
import { Spinner } from '~/components/ui';
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

interface HeaderRow {
  key: string;
  value: string;
}

export function McpServerModal({
  isPending,
  error,
  onClose,
  onSubmit,
}: {
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: CreateMcpServerRequest) => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [transport, setTransport] = useState<'http' | 'sse'>('http');
  const [headers, setHeaders] = useState<HeaderRow[]>([{ key: '', value: '' }]);

  const valid = name.trim().length > 0 && /^https:\/\//.test(url.trim());

  const submit = () => {
    if (!valid) {
      return;
    }
    const headerObj: Record<string, string> = {};
    for (const row of headers) {
      if (row.key.trim()) {
        headerObj[row.key.trim()] = row.value;
      }
    }
    onSubmit({
      name: name.trim(),
      url: url.trim(),
      transport,
      headers: Object.keys(headerObj).length > 0 ? headerObj : undefined,
    });
  };

  const setRow = (i: number, patch: Partial<HeaderRow>) =>
    setHeaders((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <ModalShell width={460} onClose={onClose}>
      <div style={{ padding: '22px 24px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600 }}>Add MCP server</h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#a1a1aa' }}>
          Remote (https) MCP servers only. Available to all users once added — restrict per user from
          their drawer.
        </p>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: '#3f3f46', marginBottom: 6 }}>
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="github"
          style={{ ...inputStyle, fontFamily: MONO, marginBottom: 14 }}
        />

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: '#3f3f46', marginBottom: 6 }}>
          URL
        </label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://my-mcp.example.com/mcp"
          style={{ ...inputStyle, fontFamily: MONO, marginBottom: 14 }}
        />

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: '#3f3f46', marginBottom: 6 }}>
          Transport
        </label>
        <select
          value={transport}
          onChange={(e) => setTransport(e.target.value as 'http' | 'sse')}
          style={{ ...inputStyle, marginBottom: 14, cursor: 'pointer' }}
        >
          <option value="http">Streamable HTTP</option>
          <option value="sse">SSE</option>
        </select>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: '#3f3f46', marginBottom: 6 }}>
          Headers <span style={{ color: '#a1a1aa', fontWeight: 400 }}>(optional, e.g. Authorization)</span>
        </label>
        {headers.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              value={row.key}
              onChange={(e) => setRow(i, { key: e.target.value })}
              placeholder="Authorization"
              style={{ ...inputStyle, flex: 1, fontFamily: MONO, fontSize: 12.5 }}
            />
            <input
              value={row.value}
              onChange={(e) => setRow(i, { value: e.target.value })}
              placeholder="Bearer …"
              style={{ ...inputStyle, flex: 1, fontFamily: MONO, fontSize: 12.5 }}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setHeaders((prev) => [...prev, { key: '', value: '' }])}
          style={{
            background: 'transparent',
            border: 'none',
            color: ACCENT,
            fontSize: 12.5,
            fontWeight: 550,
            cursor: 'pointer',
            padding: '2px 0',
          }}
        >
          + Add header
        </button>

        {error && <p style={{ margin: '12px 0 0', fontSize: 12, color: '#dc2626' }}>{error}</p>}
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
          disabled={isPending || !valid}
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
            opacity: valid ? 1 : 0.6,
          }}
        >
          {isPending ? <Spinner size={15} /> : 'Add server'}
        </button>
      </div>
    </ModalShell>
  );
}
