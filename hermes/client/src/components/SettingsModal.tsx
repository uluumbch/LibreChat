import { useState } from 'react';
import clsx from 'clsx';
import type { UpdateProfileRequest } from '@hermes/shared';
import { useAuth } from '~/auth/AuthContext';
import { useModels, useToolsets, useUpdateProfile } from '~/data/queries';
import { Button, Spinner } from '~/components/ui';

export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const { user, setUser } = useAuth();
  const modelsQuery = useModels();
  const toolsetsQuery = useToolsets();
  const updateProfile = useUpdateProfile();

  const profile = user?.hermesProfile;
  const [model, setModel] = useState(profile?.model ?? '');
  const [instructions, setInstructions] = useState(profile?.instructions ?? '');
  const [memoryEnabled, setMemoryEnabled] = useState(profile?.memoryEnabled ?? true);
  const [enabledToolsets, setEnabledToolsets] = useState<string[]>(profile?.enabledToolsets ?? []);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-surface-dark-muted p-6 text-zinc-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="text-lg font-semibold">Hermes profile</h2>
        <p className="mb-4 mt-1 text-sm text-zinc-400">
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

        <div className="mb-4 text-sm">
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

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={updateProfile.isPending}>
            {updateProfile.isPending ? <Spinner /> : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
