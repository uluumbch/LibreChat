import { useState } from 'react';
import type { AdminSlashCommand, ServerActionKey, SlashCommandType, UpsertSlashCommandRequest } from '@hermes/shared';
import { SERVER_ACTION_KEYS } from '@hermes/shared';
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 550,
  color: '#3f3f46',
  marginBottom: 6,
};

const csv = (list: string[]) => list.join(', ');
const parseCsv = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Create or edit one curated slash command. Pass `existing` to edit. */
export function SlashCommandModal({
  existing,
  isPending,
  error,
  onClose,
  onSubmit,
}: {
  existing: AdminSlashCommand | null;
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: UpsertSlashCommandRequest) => void;
}): JSX.Element {
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [type, setType] = useState<SlashCommandType>(existing?.type ?? 'prompt');
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [promptTemplate, setPromptTemplate] = useState(existing?.promptTemplate ?? '');
  const [promptPrefix, setPromptPrefix] = useState(existing?.promptPrefix ?? '');
  const [scopeToolsets, setScopeToolsets] = useState(csv(existing?.scopeToolsets ?? []));
  const [scopeSkills, setScopeSkills] = useState(csv(existing?.scopeSkills ?? []));
  const [actionKey, setActionKey] = useState<ServerActionKey>(existing?.actionKey ?? SERVER_ACTION_KEYS[0]);

  const nameValid = /^[a-z0-9][a-z0-9_-]*$/.test(name.trim());
  const valid =
    nameValid &&
    description.trim().length > 0 &&
    (type !== 'prompt' || promptTemplate.trim().length > 0);

  const submit = () => {
    if (!valid) return;
    onSubmit({
      id: existing?.id,
      name: name.trim().toLowerCase(),
      description: description.trim(),
      type,
      enabled,
      promptTemplate: type === 'prompt' ? promptTemplate : null,
      promptPrefix: type === 'skill_scope' ? promptPrefix : null,
      scopeToolsets: type === 'skill_scope' ? parseCsv(scopeToolsets) : [],
      scopeSkills: type === 'skill_scope' ? parseCsv(scopeSkills) : [],
      actionKey: type === 'server_action' ? actionKey : null,
    });
  };

  return (
    <ModalShell width={500} onClose={onClose}>
      <div style={{ padding: '22px 24px', maxHeight: '70vh', overflowY: 'auto' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600 }}>
          {existing ? `Edit /${existing.name}` : 'New slash command'}
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#a1a1aa' }}>
          Curated commands available in the composer. Enabled commands are usable by all users
          (restrict per user from their drawer).
        </p>

        <label style={labelStyle}>Command</label>
        <div style={{ position: 'relative', marginBottom: 4 }}>
          <span style={{ position: 'absolute', left: 12, top: 10, color: '#a1a1aa', fontFamily: MONO, fontSize: 13.5 }}>
            /
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="summarize"
            disabled={!!existing}
            style={{ ...inputStyle, fontFamily: MONO, paddingLeft: 22, opacity: existing ? 0.6 : 1 }}
          />
        </div>
        {name.length > 0 && !nameValid && (
          <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#dc2626' }}>
            Lowercase letters, numbers, dashes or underscores.
          </p>
        )}
        <div style={{ height: 14 }} />

        <label style={labelStyle}>Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Summarize the conversation so far"
          style={{ ...inputStyle, marginBottom: 14 }}
        />

        <label style={labelStyle}>Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as SlashCommandType)}
          style={{ ...inputStyle, marginBottom: 14, cursor: 'pointer' }}
        >
          <option value="prompt">Prompt — expand a template into the message</option>
          <option value="skill_scope">Skill scope — restrict tools/skills for the turn</option>
          <option value="server_action">Server action — fixed reply, no AI</option>
        </select>

        {type === 'prompt' && (
          <>
            <label style={labelStyle}>
              Prompt template{' '}
              <span style={{ color: '#a1a1aa', fontWeight: 400 }}>(use {'{{args}}'} for text after the command)</span>
            </label>
            <textarea
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              placeholder="Summarize the conversation so far in 5 bullet points."
              style={{ ...inputStyle, height: 96, resize: 'vertical', fontFamily: 'inherit', marginBottom: 14 }}
            />
          </>
        )}

        {type === 'skill_scope' && (
          <>
            <label style={labelStyle}>
              Prompt prefix <span style={{ color: '#a1a1aa', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              value={promptPrefix}
              onChange={(e) => setPromptPrefix(e.target.value)}
              placeholder="Research the following and cite sources:"
              style={{ ...inputStyle, height: 64, resize: 'vertical', fontFamily: 'inherit', marginBottom: 14 }}
            />
            <label style={labelStyle}>
              Toolsets <span style={{ color: '#a1a1aa', fontWeight: 400 }}>(comma-separated names)</span>
            </label>
            <input
              value={scopeToolsets}
              onChange={(e) => setScopeToolsets(e.target.value)}
              placeholder="web_search, browser"
              style={{ ...inputStyle, fontFamily: MONO, fontSize: 12.5, marginBottom: 14 }}
            />
            <label style={labelStyle}>
              Skills <span style={{ color: '#a1a1aa', fontWeight: 400 }}>(comma-separated names)</span>
            </label>
            <input
              value={scopeSkills}
              onChange={(e) => setScopeSkills(e.target.value)}
              placeholder="research"
              style={{ ...inputStyle, fontFamily: MONO, fontSize: 12.5, marginBottom: 14 }}
            />
            <p style={{ margin: '-4px 0 14px', fontSize: 11.5, color: '#a1a1aa', lineHeight: 1.5 }}>
              Leave both empty to only prepend the prefix (no tool restriction).
            </p>
          </>
        )}

        {type === 'server_action' && (
          <>
            <label style={labelStyle}>Action</label>
            <select
              value={actionKey}
              onChange={(e) => setActionKey(e.target.value as ServerActionKey)}
              style={{ ...inputStyle, marginBottom: 14, cursor: 'pointer' }}
            >
              {SERVER_ACTION_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#3f3f46', cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled (available to users)
        </label>

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
          {isPending ? <Spinner size={15} /> : existing ? 'Save changes' : 'Create command'}
        </button>
      </div>
    </ModalShell>
  );
}
