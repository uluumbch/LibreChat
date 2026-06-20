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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-surface-dark-muted p-6 text-zinc-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="text-lg font-semibold">Settings</h2>

        <div className="mb-4 mt-3 flex gap-1 rounded-lg bg-black/30 p-1 text-sm">
          <button
            type="button"
            onClick={() => setTab('profile')}
            className={clsx(
              'flex-1 rounded-md px-3 py-1.5 transition',
              tab === 'profile' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200',
            )}
          >
            Profile
          </button>
          <button
            type="button"
            onClick={() => setTab('skills')}
            className={clsx(
              'flex-1 rounded-md px-3 py-1.5 transition',
              tab === 'skills' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200',
            )}
          >
            Skills{skillCount ? ` (${skillCount})` : ''}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {tab === 'profile' && (
            <>
              <p className="mb-4 text-sm text-zinc-400">
                Preferences applied to every new conversation.
              </p>

              <label className="mb-3 block text-sm">
                <span className="text-zinc-400">Model</span>
                <select
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 outline-none ring-1 ring-white/10"
                >
                  {modelsQuery.data?.items.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mb-3 block text-sm">
                <span className="text-zinc-400">Persona / instructions</span>
                <textarea
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  rows={4}
                  placeholder="e.g. You are a concise senior engineer…"
                  className="mt-1 w-full resize-none rounded-lg bg-black/30 px-3 py-2 outline-none ring-1 ring-white/10"
                />
              </label>

              <label className="mb-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={memoryEnabled}
                  onChange={(event) => setMemoryEnabled(event.target.checked)}
                />
                <span>Enable long-term memory</span>
              </label>

              <div className="mb-2 text-sm">
                <span className="text-zinc-400">Toolsets</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {toolsetsQuery.isLoading && <Spinner size={16} />}
                  {toolsetsQuery.data?.items.map((toolset) => (
                    <button
                      key={toolset.name}
                      type="button"
                      onClick={() => toggleToolset(toolset.name)}
                      title={toolset.description}
                      className={clsx(
                        'rounded-full px-3 py-1 text-xs ring-1',
                        enabledToolsets.includes(toolset.name)
                          ? 'bg-blue-600 text-white ring-blue-500'
                          : 'text-zinc-300 ring-white/15',
                      )}
                    >
                      {toolset.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  A preference shown in the UI; enforcement depends on gateway config.
                </p>
              </div>
            </>
          )}

          {tab === 'skills' && (
            <div className="text-sm">
              <p className="mb-3 text-zinc-400">
                Skills the agent can draw on, installed on the gateway. Read-only.
              </p>
              {skillsQuery.isLoading && <Spinner size={16} />}
              {skillsQuery.isError && (
                <p className="text-sm text-red-400">Couldn&apos;t load skills from the gateway.</p>
              )}
              {!skillsQuery.isLoading && skillCount === 0 && !skillsQuery.isError && (
                <p className="text-zinc-500">No skills installed.</p>
              )}
              <div className="space-y-4">
                {skillsByCategory.map(([category, skills]) => (
                  <div key={category}>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {category}
                    </h3>
                    <ul className="space-y-1.5">
                      {skills.map((skill) => (
                        <li key={skill.name} className="rounded-lg bg-black/20 px-3 py-2">
                          <div className="font-medium text-zinc-200">{skill.name}</div>
                          {skill.description && (
                            <div className="mt-0.5 text-xs text-zinc-400">{skill.description}</div>
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

        <div className="mt-4 flex justify-end gap-2">
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
