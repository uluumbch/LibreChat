import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { SkillOption, UpdateProfileRequest } from '@hermes/shared';
import { useAuth } from '~/auth/AuthContext';
import { useModels, useSkills, useToolsets, useUpdateProfile } from '~/data/queries';
import { Button, Spinner } from '~/components/ui';

type Tab = 'profile' | 'skills';

export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const { user, setUser } = useAuth();
  const modelsQuery = useModels();
  const toolsetsQuery = useToolsets();
  const skillsQuery = useSkills();
  const updateProfile = useUpdateProfile();

  const [tab, setTab] = useState<Tab>('profile');
  const profile = user?.hermesProfile;
  const [model, setModel] = useState(profile?.model ?? '');
  const [instructions, setInstructions] = useState(profile?.instructions ?? '');
  const [memoryEnabled, setMemoryEnabled] = useState(profile?.memoryEnabled ?? true);
  const [enabledToolsets, setEnabledToolsets] = useState<string[]>(profile?.enabledToolsets ?? []);

  const skillsByCategory = useMemo(() => {
    const groups = new Map<string, SkillOption[]>();
    for (const skill of skillsQuery.data?.items ?? []) {
      const category = skill.category || 'Other';
      const list = groups.get(category) ?? [];
      list.push(skill);
      groups.set(category, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [skillsQuery.data]);

  const toggleToolset = (name: string) => {
    setEnabledToolsets((prev) =>
      prev.includes(name) ? prev.filter((value) => value !== name) : [...prev, name],
    );
  };

  const save = async () => {
    const body: UpdateProfileRequest = {
      model: model || undefined,
      instructions: instructions || null,
      memoryEnabled,
      enabledToolsets,
    };
    const updated = await updateProfile.mutateAsync(body);
    setUser(updated);
    onClose();
  };

  const skillCount = skillsQuery.data?.items.length ?? 0;
  const tabClass = (active: boolean) =>
    clsx(
      'rounded-t-lg px-3 py-2 text-[13px] font-medium transition',
      active
        ? 'border-b-2 border-brand text-ink'
        : 'border-b-2 border-transparent text-ink-muted hover:text-ink-soft',
    );

  return (
    <div
      className="animate-hm-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[3px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-[560px] max-h-[88vh] w-[640px] max-w-[92vw] flex-col overflow-hidden rounded-[18px] border border-black/10 bg-white text-ink shadow-[0_30px_80px_rgba(0,0,0,0.25)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-black/[0.07] px-5 py-4">
          <h2 className="text-base font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface-input"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 border-b border-black/[0.07] px-5 pt-2">
          <button type="button" onClick={() => setTab('profile')} className={tabClass(tab === 'profile')}>
            Profile
          </button>
          <button type="button" onClick={() => setTab('skills')} className={tabClass(tab === 'skills')}>
            Skills{skillCount ? ` (${skillCount})` : ''}
          </button>
        </div>

        <div className="hm-scroll min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'profile' && (
            <>
              <div className="mb-5 flex items-center justify-between rounded-[11px] border border-black/[0.08] bg-surface-input px-3.5 py-3">
                <div>
                  <div className="text-[13.5px] font-medium text-ink">
                    {user?.tier === 'dedicated' ? 'Dedicated plan' : 'Free plan'}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {user?.tier === 'dedicated'
                      ? 'Higher limits and reserved gateway capacity.'
                      : 'Shared agent pool with standard limits.'}
                  </div>
                </div>
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                    user?.tier === 'dedicated'
                      ? 'bg-amber-500/10 text-amber-700'
                      : 'bg-black/[0.06] text-ink-muted',
                  )}
                >
                  {user?.tier === 'dedicated' ? 'Dedicated' : 'Free'}
                </span>
              </div>

              <div className="mb-5">
                <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">
                  Default model
                </label>
                <div className="relative">
                  <select
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    className="w-full appearance-none rounded-[10px] border border-black/10 bg-surface-input px-3 py-2.5 font-mono text-[13.5px] text-ink-soft outline-none"
                  >
                    {modelsQuery.data?.items.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#a1a1aa"
                    strokeWidth="2"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <path d="M5 9l7 7 7-7" />
                  </svg>
                </div>
              </div>

              <div className="mb-5">
                <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">
                  Persona &amp; instructions
                </label>
                <textarea
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  rows={4}
                  placeholder="e.g. You are a concise senior engineer…"
                  className="h-[90px] w-full resize-none rounded-[10px] border border-black/10 bg-surface-input px-3 py-2.5 text-[13px] leading-relaxed text-ink-soft outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setMemoryEnabled((v) => !v)}
                className="mb-5 flex w-full items-center justify-between rounded-[11px] border border-black/[0.08] bg-surface-input px-3.5 py-3 text-left"
              >
                <span>
                  <span className="block text-[13.5px] font-medium text-ink">
                    Enable long-term memory
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    Let the agent remember facts across conversations.
                  </span>
                </span>
                <span
                  className={clsx(
                    'relative h-[22px] w-[38px] flex-none rounded-full transition',
                    memoryEnabled ? 'bg-brand' : 'bg-zinc-300',
                  )}
                >
                  <span
                    className="absolute top-[2.5px] h-[17px] w-[17px] rounded-full bg-white shadow transition-all"
                    style={{ left: memoryEnabled ? 18.5 : 2.5 }}
                  />
                </span>
              </button>

              <div>
                <label className="mb-2 block text-[12.5px] font-semibold text-ink-soft">Toolsets</label>
                <div className="flex flex-wrap gap-2">
                  {toolsetsQuery.isLoading && <Spinner size={16} />}
                  {toolsetsQuery.data?.items.map((toolset) => (
                    <button
                      key={toolset.name}
                      type="button"
                      onClick={() => toggleToolset(toolset.name)}
                      title={toolset.description}
                      className={clsx(
                        'rounded-full border px-3 py-1 text-xs font-medium transition',
                        enabledToolsets.includes(toolset.name)
                          ? 'border-brand bg-brand text-white'
                          : 'border-black/10 bg-white text-ink-soft hover:bg-surface-input',
                      )}
                    >
                      {toolset.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  A preference shown in the UI; enforcement depends on gateway config.
                </p>
              </div>
            </>
          )}

          {tab === 'skills' && (
            <div className="text-sm">
              <p className="mb-3 text-ink-muted">
                Skills the agent can draw on, installed on the gateway. Read-only.
              </p>
              {skillsQuery.isLoading && <Spinner size={16} />}
              {skillsQuery.isError && (
                <p className="text-sm text-red-600">Couldn&apos;t load skills from the gateway.</p>
              )}
              {!skillsQuery.isLoading && skillCount === 0 && !skillsQuery.isError && (
                <p className="text-ink-faint">No skills installed.</p>
              )}
              <div className="space-y-4">
                {skillsByCategory.map(([category, skills]) => (
                  <div key={category}>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                      {category}
                    </h3>
                    <ul className="space-y-1.5">
                      {skills.map((skill) => (
                        <li
                          key={skill.name}
                          className="rounded-[10px] border border-black/[0.06] bg-surface-input px-3 py-2.5"
                        >
                          <div className="font-mono text-[13px] font-medium text-ink-soft">
                            {skill.name}
                          </div>
                          {skill.description && (
                            <div className="mt-0.5 text-xs text-ink-muted">{skill.description}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/[0.07] px-5 py-4">
          <Button variant="ghost" onClick={onClose}>
            {tab === 'skills' ? 'Close' : 'Cancel'}
          </Button>
          {tab === 'profile' && (
            <Button onClick={() => void save()} disabled={updateProfile.isPending}>
              {updateProfile.isPending ? <Spinner /> : 'Save'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
