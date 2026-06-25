import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ApiError } from '~/api/client';
import { useComposioToolkits, useConnectComposio, useDisconnectComposio } from '~/data/queries';
import { Spinner } from '~/components/ui';

/**
 * Settings → Third-Party Apps. Lets the user connect/disconnect the apps an admin
 * granted them (Google Drive, Notion, Google Sheets) via Composio OAuth. Connecting
 * sends the browser to the Composio-hosted consent screen; on return the list
 * reflects the new state.
 */
export function ThirdPartyApps(): JSX.Element {
  const { data, isLoading, isError, refetch } = useComposioToolkits();
  const connect = useConnectComposio();
  const disconnect = useDisconnectComposio();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // When the user returns from the Composio OAuth tab, refresh connection status.
  useEffect(() => {
    const onFocus = () => void refetch();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  const onConnect = async (slug: string) => {
    setError(null);
    setBusy(slug);
    // Open the tab synchronously inside the click gesture so popup blockers allow
    // it, then point it at the Composio OAuth URL once the server returns it. The
    // user authorizes in that tab and closes it; our app tab stays put.
    const tab = window.open('about:blank', '_blank');
    try {
      const { redirectUrl } = await connect.mutateAsync(slug);
      if (tab) tab.location.href = redirectUrl;
      else window.location.assign(redirectUrl); // popup blocked → same-tab fallback
    } catch (err) {
      if (tab) tab.close();
      setError(err instanceof ApiError ? err.message : 'Could not start the connection.');
    } finally {
      setBusy(null);
    }
  };

  const onDisconnect = async (slug: string) => {
    setError(null);
    setBusy(slug);
    try {
      await disconnect.mutateAsync(slug);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not disconnect.');
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size={18} />
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-red-600">Couldn&apos;t load your apps.</p>;
  }

  if (!data?.configured) {
    return (
      <p className="text-sm text-ink-muted">
        Third-party apps aren&apos;t configured on this server yet. Ask your admin to set a Composio
        API key.
      </p>
    );
  }

  if (!data.enabled || data.items.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No third-party apps have been enabled for your account. An admin can grant access from the
        admin panel.
      </p>
    );
  }

  return (
    <div className="text-sm">
      <p className="mb-4 text-ink-muted">
        Connect your own accounts so the agent can act on them. Credentials are stored securely by
        Composio and scoped to you.
      </p>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <ul className="space-y-2">
        {data.items.map((app) => (
          <li
            key={app.slug}
            className="flex items-center justify-between rounded-[11px] border border-black/[0.07] bg-surface-input px-3.5 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-medium text-ink">{app.name}</span>
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                    app.connected ? 'bg-emerald-500/10 text-emerald-700' : 'bg-black/[0.06] text-ink-muted',
                  )}
                >
                  {app.connected ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-ink-faint">{app.slug}</div>
            </div>
            <button
              type="button"
              disabled={busy === app.slug}
              onClick={() => void (app.connected ? onDisconnect(app.slug) : onConnect(app.slug))}
              className={clsx(
                'flex-none rounded-[9px] border px-3 py-1.5 text-[12.5px] font-medium transition',
                app.connected
                  ? 'border-red-300 bg-white text-red-600 hover:bg-red-50'
                  : 'border-brand bg-brand text-white hover:opacity-90',
              )}
            >
              {busy === app.slug ? <Spinner size={13} /> : app.connected ? 'Disconnect' : 'Connect'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
