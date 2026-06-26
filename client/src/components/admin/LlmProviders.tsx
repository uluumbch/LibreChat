import { useState } from 'react';
import type { AdminLlmModel, AdminLlmProvider, LlmProviderKind } from '@hermes/shared';
import { LLM_PROVIDER_KINDS } from '@hermes/shared';
import { Spinner } from '~/components/ui';
import { ApiError } from '~/api/client';
import {
  useAdminLlmProviders,
  useCreateLlmModel,
  useCreateLlmProvider,
  useDeleteLlmModel,
  useDeleteLlmProvider,
  useUpdateLlmModel,
  useUpdateLlmProvider,
} from '~/data/queries';
import { ACCENT, MONO } from './theme';
import { Card } from './primitives';

/** Parse a price input into USD/1M tokens: blank → null (unpriced), invalid → undefined (skip). */
function parsePrice(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') {
    return null;
  }
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Format a stored price for an input box: null → '' so the field reads empty. */
function priceText(v: number | null): string {
  return v == null ? '' : String(v);
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        cursor: disabled ? 'default' : 'pointer',
        position: 'relative',
        transition: 'background .2s',
        flex: 'none',
        border: 'none',
        padding: 0,
        opacity: disabled ? 0.6 : 1,
        background: on ? ACCENT : '#d4d4d8',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2.5,
          left: on ? 18.5 : 2.5,
          width: 17,
          height: 17,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .2s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#f4f4f6',
  border: '1px solid #e8e8ec',
  borderRadius: 9,
  padding: '9px 12px',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: '#52525b',
  marginBottom: 5,
  display: 'block',
};

function primaryBtn(disabled = false): React.CSSProperties {
  return {
    background: ACCENT,
    border: 'none',
    borderRadius: 10,
    padding: '9px 15px',
    fontSize: 13.5,
    fontWeight: 600,
    color: '#fff',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

const ghostBtn: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e2e7',
  borderRadius: 10,
  padding: '9px 15px',
  fontSize: 13.5,
  fontWeight: 500,
  color: '#52525b',
  cursor: 'pointer',
};

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }): JSX.Element {
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(24,24,27,0.4)',
        backdropFilter: 'blur(2px)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          maxWidth: '92vw',
          background: '#fff',
          borderRadius: 14,
          padding: 22,
          boxShadow: '0 24px 70px rgba(0,0,0,0.25)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Create/edit a provider. On edit, the key field is blank = keep the stored key. */
function ProviderForm({
  provider,
  onClose,
  onFlash,
}: {
  provider: AdminLlmProvider | null;
  onClose: () => void;
  onFlash: (msg: string) => void;
}): JSX.Element {
  const create = useCreateLlmProvider();
  const update = useUpdateLlmProvider();
  const editing = provider != null;
  const [name, setName] = useState(provider?.name ?? '');
  const [kind, setKind] = useState<LlmProviderKind>(provider?.kind ?? 'gemini');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;

  const submit = async () => {
    setError(null);
    const body = {
      name: name.trim(),
      kind,
      baseUrl: kind === 'openai-compatible' ? baseUrl.trim() : null,
      ...(apiKey ? { apiKey } : {}),
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: provider.id, body });
        onFlash(`Updated ${body.name}`);
      } else {
        if (!apiKey) {
          setError('An API key is required.');
          return;
        }
        await create.mutateAsync(body);
        onFlash(`Added ${body.name}`);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save provider');
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 style={{ margin: '0 0 14px', fontSize: 15.5, fontWeight: 650 }}>
        {editing ? `Edit ${provider.name}` : 'Add provider'}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={labelStyle}>Display name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Google Gemini" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Provider kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as LlmProviderKind)} style={inputStyle}>
            {LLM_PROVIDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        {kind === 'openai-compatible' && (
          <div>
            <label style={labelStyle}>Base URL</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              style={inputStyle}
            />
          </div>
        )}
        <div>
          <label style={labelStyle}>API key {editing && <span style={{ color: '#a1a1aa' }}>(leave blank to keep)</span>}</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={editing ? '••••••••' : 'sk-…'}
            autoComplete="new-password"
            style={inputStyle}
          />
        </div>
        {error && <div style={{ fontSize: 12.5, color: '#dc2626' }}>{error}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 18 }}>
        <button type="button" onClick={onClose} style={ghostBtn}>
          Cancel
        </button>
        <button type="button" onClick={() => void submit()} disabled={pending || !name.trim()} style={primaryBtn(pending || !name.trim())}>
          {pending ? 'Saving…' : editing ? 'Save' : 'Add provider'}
        </button>
      </div>
    </Modal>
  );
}

/** Add a model under a provider. */
function ModelForm({
  providerId,
  onClose,
  onFlash,
}: {
  providerId: string;
  onClose: () => void;
  onFlash: (msg: string) => void;
}): JSX.Element {
  const create = useCreateLlmModel();
  const [slug, setSlug] = useState('');
  const [modelId, setModelId] = useState('');
  const [label, setLabel] = useState('');
  const [inputPrice, setInputPrice] = useState('');
  const [outputPrice, setOutputPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await create.mutateAsync({
        providerId,
        body: {
          slug: slug.trim(),
          modelId: modelId.trim(),
          label: label.trim(),
          inputUsdPerMTok: parsePrice(inputPrice),
          outputUsdPerMTok: parsePrice(outputPrice),
        },
      });
      onFlash(`Added ${label || slug}`);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add model');
    }
  };

  const ready = slug.trim() && modelId.trim() && label.trim();
  return (
    <Modal onClose={onClose}>
      <h3 style={{ margin: '0 0 14px', fontSize: 15.5, fontWeight: 650 }}>Add model</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={labelStyle}>Slug <span style={{ color: '#a1a1aa' }}>(what users pick; unique)</span></label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="gemini-2.0-flash" style={{ ...inputStyle, fontFamily: MONO }} />
        </div>
        <div>
          <label style={labelStyle}>Upstream model id</label>
          <input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="gemini-2.0-flash" style={{ ...inputStyle, fontFamily: MONO }} />
        </div>
        <div>
          <label style={labelStyle}>Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Gemini 2.0 Flash" style={inputStyle} />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>USD / 1M input <span style={{ color: '#a1a1aa' }}>(optional)</span></label>
            <input value={inputPrice} onChange={(e) => setInputPrice(e.target.value)} placeholder="3.00" inputMode="decimal" style={{ ...inputStyle, fontFamily: MONO }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>USD / 1M output</label>
            <input value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)} placeholder="15.00" inputMode="decimal" style={{ ...inputStyle, fontFamily: MONO }} />
          </div>
        </div>
        {error && <div style={{ fontSize: 12.5, color: '#dc2626' }}>{error}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 18 }}>
        <button type="button" onClick={onClose} style={ghostBtn}>
          Cancel
        </button>
        <button type="button" onClick={() => void submit()} disabled={!ready || create.isPending} style={primaryBtn(!ready || create.isPending)}>
          {create.isPending ? 'Adding…' : 'Add model'}
        </button>
      </div>
    </Modal>
  );
}

function ModelRow({
  model,
  onFlash,
}: {
  model: AdminLlmModel;
  onFlash: (msg: string) => void;
}): JSX.Element {
  const toggle = useUpdateLlmModel();
  const del = useDeleteLlmModel();
  const update = useUpdateLlmModel();

  const commitPrice = (field: 'inputUsdPerMTok' | 'outputUsdPerMTok', raw: string) => {
    const next = parsePrice(raw);
    if (next === undefined || next === model[field]) {
      return; // invalid input or unchanged — leave stored value as-is
    }
    const body =
      field === 'inputUsdPerMTok' ? { inputUsdPerMTok: next } : { outputUsdPerMTok: next };
    void update.mutateAsync({ slug: model.slug, body });
  };

  const priceInput = (field: 'inputUsdPerMTok' | 'outputUsdPerMTok') => (
    <input
      defaultValue={priceText(model[field])}
      onBlur={(e) => commitPrice(field, e.target.value)}
      placeholder="—"
      inputMode="decimal"
      title={field === 'inputUsdPerMTok' ? 'USD per 1M input tokens' : 'USD per 1M output tokens'}
      style={{
        width: 64,
        fontFamily: MONO,
        fontSize: 11,
        textAlign: 'right',
        padding: '3px 6px',
        border: '1px solid #e4e4e7',
        borderRadius: 6,
        background: '#fff',
      }}
    />
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 550 }}>{model.label}</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: '#a1a1aa' }}>{model.slug}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: '#a1a1aa', marginTop: 1 }}>→ {model.modelId}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} title="USD per 1M tokens (in / out)">
        <span style={{ fontSize: 10.5, color: '#a1a1aa' }}>$/1M</span>
        {priceInput('inputUsdPerMTok')}
        <span style={{ fontSize: 10.5, color: '#a1a1aa' }}>/</span>
        {priceInput('outputUsdPerMTok')}
      </div>
      {toggle.isPending && toggle.variables?.slug === model.slug ? (
        <Spinner size={15} />
      ) : (
        <Toggle
          on={model.enabled}
          onClick={() => {
            void toggle.mutateAsync({ slug: model.slug, body: { enabled: !model.enabled } });
          }}
        />
      )}
      <button
        type="button"
        title="Delete model"
        onClick={() => {
          void del.mutateAsync(model.slug).then(() => onFlash(`Deleted ${model.label}`));
        }}
        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
      >
        ×
      </button>
    </div>
  );
}

export function LlmProviders({ onFlash }: { onFlash: (msg: string) => void }): JSX.Element {
  const { data, isLoading } = useAdminLlmProviders();
  const deleteProvider = useDeleteLlmProvider();
  const [editProvider, setEditProvider] = useState<AdminLlmProvider | null>(null);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [addModelTo, setAddModelTo] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminLlmProvider | null>(null);

  const items = data?.items ?? [];

  return (
    <>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '15px 18px',
            borderBottom: '1px solid #f0f0f3',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>LLM providers</h3>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#a1a1aa' }}>
              Register first-party providers and the models users can pick. Keys are encrypted at rest.
            </p>
          </div>
          <button
            type="button"
            disabled={data != null && !data.configured}
            onClick={() => {
              setEditProvider(null);
              setShowProviderForm(true);
            }}
            style={primaryBtn(data != null && !data.configured)}
          >
            + Add provider
          </button>
        </div>

        {data && !data.configured && (
          <div style={{ padding: '28px 18px', fontSize: 13, color: '#a1a1aa', textAlign: 'center' }}>
            Secrets encryption is not configured on this server (set SECRETS_KEY).
          </div>
        )}

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: '#a1a1aa' }}>
            <Spinner size={20} />
          </div>
        )}

        {!isLoading && data?.configured && items.length === 0 && (
          <div style={{ padding: '28px 18px', fontSize: 13, color: '#a1a1aa', textAlign: 'center' }}>
            No providers yet. Add one to offer models to users.
          </div>
        )}

        {items.map((p, i) => (
          <div key={p.id} style={{ padding: '15px 18px', borderBottom: i === items.length - 1 ? 'none' : '1px solid #f4f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: 'rgba(91,84,232,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: MONO,
                  fontSize: 12,
                  fontWeight: 600,
                  color: ACCENT,
                  flex: 'none',
                }}
              >
                {p.name.slice(0, 2).toUpperCase()}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: '#a1a1aa' }}>{p.kind}</span>
                  {!p.enabled && <span style={{ fontSize: 10.5, color: '#dc2626' }}>· disabled</span>}
                  {!p.hasKey && <span style={{ fontSize: 10.5, color: '#dc2626' }}>· no key</span>}
                </div>
                {p.baseUrl && (
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: '#a1a1aa', marginTop: 1 }}>{p.baseUrl}</div>
                )}
              </div>
              <button type="button" onClick={() => { setEditProvider(p); setShowProviderForm(true); }} style={ghostBtn}>
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(p)}
                style={{ ...ghostBtn, color: '#dc2626', borderColor: '#f0d0d0' }}
              >
                Delete
              </button>
            </div>

            <div style={{ marginTop: 10, paddingLeft: 46 }}>
              {p.models.length === 0 ? (
                <div style={{ fontSize: 12, color: '#a1a1aa', padding: '4px 0' }}>No models yet.</div>
              ) : (
                p.models.map((m) => <ModelRow key={m.slug} model={m} onFlash={onFlash} />)
              )}
              <button
                type="button"
                onClick={() => setAddModelTo(p.id)}
                style={{ background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '6px 0 0' }}
              >
                + Add model
              </button>
            </div>
          </div>
        ))}
      </Card>

      {showProviderForm && (
        <ProviderForm provider={editProvider} onClose={() => setShowProviderForm(false)} onFlash={onFlash} />
      )}

      {addModelTo && <ModelForm providerId={addModelTo} onClose={() => setAddModelTo(null)} onFlash={onFlash} />}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15.5, fontWeight: 650 }}>Delete {confirmDelete.name}?</h3>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: '#52525b', lineHeight: 1.55 }}>
            This removes the provider and its <strong>{confirmDelete.models.length}</strong> model
            {confirmDelete.models.length === 1 ? '' : 's'}, and revokes them from every user&apos;s grant.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
            <button type="button" onClick={() => setConfirmDelete(null)} style={ghostBtn}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const p = confirmDelete;
                setConfirmDelete(null);
                void deleteProvider.mutateAsync(p.id).then(() => onFlash(`Deleted ${p.name}`));
              }}
              style={{ background: '#dc2626', border: 'none', borderRadius: 10, padding: '9px 15px', fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
            >
              Delete provider
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
