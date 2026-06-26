import { useState } from 'react';
import type { ModelUsageRow } from '@hermes/shared';
import { Spinner } from '~/components/ui';
import { useAdminAnalytics } from '~/data/queries';
import { ACCENT, MONO, fmt } from './theme';
import { Card } from './primitives';

const RANGES = [7, 14, 30, 90] as const;

/** Compact USD, e.g. $12.34 or $1,204.50. Null prices read as a dash. */
function usd(value: number | null): string {
  if (value == null) {
    return '—';
  }
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Price per 1M tokens, or a dash hint when unset. */
function priceCell(value: number | null): string {
  return value == null ? '—' : `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function RangeTabs({ days, onChange }: { days: number; onChange: (d: number) => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {RANGES.map((r) => {
        const active = r === days;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            style={{
              fontSize: 12,
              fontWeight: 550,
              padding: '5px 11px',
              borderRadius: 7,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: active ? ACCENT : '#e4e4e7',
              background: active ? 'rgba(91,84,232,0.1)' : '#fff',
              color: active ? ACCENT : '#71717a',
            }}
          >
            {r}d
          </button>
        );
      })}
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'right',
  fontSize: 11,
  fontWeight: 600,
  color: '#a1a1aa',
  padding: '0 0 8px',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  textAlign: 'right',
  fontSize: 12.5,
  fontFamily: MONO,
  color: '#3f3f46',
  padding: '9px 0',
  borderTop: '1px solid #f4f4f6',
  whiteSpace: 'nowrap',
};

function ModelTable({ rows }: { rows: ModelUsageRow[] }): JSX.Element {
  if (rows.length === 0) {
    return <p style={{ fontSize: 13, color: '#a1a1aa', margin: 0 }}>No usage in this window.</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Model</th>
            <th style={th}>Msgs</th>
            <th style={th}>Input tok</th>
            <th style={th}>Output tok</th>
            <th style={th}>Total tok</th>
            <th style={th}>$/1M in</th>
            <th style={th}>$/1M out</th>
            <th style={th}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.model ?? '__pool__'}>
              <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit' }}>
                <span style={{ fontWeight: 550, color: '#27272a' }}>{row.label}</span>
                {row.model && (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: '#a1a1aa', marginLeft: 8 }}>
                    {row.model}
                  </span>
                )}
                {row.costUsd == null && (
                  <span style={{ fontSize: 10.5, color: '#d97706', marginLeft: 8 }}>set price</span>
                )}
              </td>
              <td style={td}>{fmt(row.messageCount)}</td>
              <td style={td}>{fmt(row.inputTokens)}</td>
              <td style={td}>{fmt(row.outputTokens)}</td>
              <td style={td}>{fmt(row.totalTokens)}</td>
              <td style={td}>{priceCell(row.inputUsdPerMTok)}</td>
              <td style={td}>{priceCell(row.outputUsdPerMTok)}</td>
              <td style={{ ...td, fontWeight: 600, color: row.costUsd == null ? '#a1a1aa' : '#18181b' }}>
                {usd(row.costUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Analytics(): JSX.Element {
  const [days, setDays] = useState<number>(30);
  const query = useAdminAnalytics(days);
  const data = query.data;

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <p style={{ margin: 0, fontSize: 12.5, color: '#71717a' }}>
          Token usage and USD cost per model. Cost recomputes from current model prices.
        </p>
        <RangeTabs days={days} onChange={setDays} />
      </div>

      {query.isLoading || !data ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48, color: '#a1a1aa' }}>
          <Spinner size={22} />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginBottom: 16 }}>
            <Card style={{ padding: '16px 17px' }}>
              <div style={{ fontSize: 12.5, color: '#71717a', fontWeight: 500, marginBottom: 8 }}>
                Total cost (priced models)
              </div>
              <div style={{ fontSize: 25, fontWeight: 650, letterSpacing: '-0.02em', color: '#18181b', fontFamily: MONO }}>
                {usd(data.totalCostUsd)}
              </div>
              <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 4 }}>last {data.rangeDays} days</div>
            </Card>
            <Card style={{ padding: '16px 17px' }}>
              <div style={{ fontSize: 12.5, color: '#71717a', fontWeight: 500, marginBottom: 8 }}>
                Total tokens
              </div>
              <div style={{ fontSize: 25, fontWeight: 650, letterSpacing: '-0.02em', color: '#18181b', fontFamily: MONO }}>
                {fmt(data.totalTokens)}
              </div>
              <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 4 }}>across all models</div>
            </Card>
          </div>

          <Card style={{ padding: '18px 20px', marginBottom: 14 }}>
            <h3 style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 600 }}>Daily spend</h3>
            <p style={{ margin: '0 0 18px', fontSize: 11.5, color: '#a1a1aa' }}>
              USD cost · last {data.rangeDays} days
            </p>
            <CostChart points={data.costChart} />
          </Card>

          <Card style={{ padding: '18px 20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Usage by model</h3>
            <ModelTable rows={data.rows} />
          </Card>
        </>
      )}
    </>
  );
}

function CostChart({ points }: { points: { label: string; cost?: number; messages: number }[] }): JSX.Element {
  const max = Math.max(0.0001, ...points.map((p) => p.cost ?? 0));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140 }}>
      {points.map((point, i) => (
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
            title={`${point.label} · ${usd(point.cost ?? 0)} · ${point.messages} replies`}
            style={{
              width: '100%',
              borderRadius: '5px 5px 0 0',
              background: i === points.length - 1 ? ACCENT : 'rgba(91,84,232,0.28)',
              height: `${Math.max(2, Math.round(((point.cost ?? 0) / max) * 100))}%`,
              transition: 'height .3s',
            }}
          />
          <span style={{ fontSize: 9, color: '#c4c4cc' }}>
            {i % Math.ceil(points.length / 7) === 0 ? point.label.split(' ')[1] : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
