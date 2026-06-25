import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { AdminUser } from '@hermes/shared';
import { useAuth } from '~/auth/AuthContext';
import {
  useAdminJobAction,
  useAdminJobs,
  useAdminOverview,
  useAdminUsers,
  useInviteUser,
  useTopupUser,
} from '~/data/queries';
import { ApiError } from '~/api/client';
import { Overview } from '~/components/admin/Overview';
import { UsersTable } from '~/components/admin/UsersTable';
import type { UserFilter } from '~/components/admin/UsersTable';
import { Billing } from '~/components/admin/Billing';
import { JobsTable } from '~/components/admin/JobsTable';
import { McpServers } from '~/components/admin/McpServers';
import { ComposioToolkits } from '~/components/admin/ComposioToolkits';
import { UserDrawer } from '~/components/admin/UserDrawer';
import { TopupModal } from '~/components/admin/TopupModal';
import { InviteModal } from '~/components/admin/InviteModal';
import { Avatar } from '~/components/admin/primitives';
import { ACCENT } from '~/components/admin/theme';
import {
  CheckIcon,
  ClockIcon,
  CreditsIcon,
  OverviewIcon,
  PlugIcon,
  SearchIcon,
  ShieldIcon,
  UsersIcon,
} from '~/components/admin/icons';

type View = 'overview' | 'users' | 'billing' | 'jobs' | 'mcp' | 'composio';

const VIEWS: readonly View[] = ['overview', 'users', 'billing', 'jobs', 'mcp', 'composio'];

function isView(value: string | undefined): value is View {
  return value != null && (VIEWS as readonly string[]).includes(value);
}

/** Path for a section tab; overview is the canonical bare `/admin`. */
function viewPath(view: View): string {
  return view === 'overview' ? '/admin' : `/admin/${view}`;
}

const TITLES: Record<View, [string, string]> = {
  overview: ['Overview', 'Workspace usage and agent activity at a glance'],
  users: ['Users', 'Manage agent profiles and credits'],
  billing: ['Credits', 'Per-user credit balances and top-ups'],
  jobs: ['Scheduled jobs', 'All cron jobs running across user agents'],
  mcp: ['MCP servers', 'Global MCP connectors available to user agents'],
  composio: ['Composio toolkits', 'Third-party apps users can connect to'],
};

const NAV: Array<{ key: View; label: string; icon: ReactNode }> = [
  { key: 'overview', label: 'Overview', icon: <OverviewIcon /> },
  { key: 'users', label: 'Users', icon: <UsersIcon /> },
  { key: 'billing', label: 'Credits', icon: <CreditsIcon /> },
  { key: 'jobs', label: 'Scheduled jobs', icon: <ClockIcon /> },
  { key: 'mcp', label: 'MCP servers', icon: <ShieldIcon size={16} /> },
  { key: 'composio', label: 'Composio toolkits', icon: <PlugIcon size={16} /> },
];

export default function AdminPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { section } = useParams();
  const view: View = isView(section) ? section : 'overview';
  const goTo = (next: View) => navigate(viewPath(next));
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<UserFilter>('all');
  const [selId, setSelId] = useState<string | null>(null);
  const [topupUser, setTopupUser] = useState<AdminUser | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const overviewQuery = useAdminOverview();
  const usersQuery = useAdminUsers(view === 'users' ? search : '');
  const billingQuery = useAdminUsers('');
  const jobsQuery = useAdminJobs();
  const jobAction = useAdminJobAction();
  const topup = useTopupUser();
  const invite = useInviteUser();

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const flash = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  const lowCount = overviewQuery.data?.needsAttention ?? 0;
  const [title, subtitle] = TITLES[view];

  const users = usersQuery.data?.items ?? [];
  const billingUsers = billingQuery.data?.items ?? [];

  const confirmTopup = async (amount: number) => {
    if (!topupUser) {
      return;
    }
    await topup.mutateAsync({ id: topupUser.id, amount });
    flash(`Added ${amount.toLocaleString()} credits`);
    setTopupUser(null);
  };

  const sendInvite = async (input: Parameters<typeof invite.mutateAsync>[0]) => {
    setInviteError(null);
    try {
      await invite.mutateAsync(input);
      setInviteOpen(false);
      flash('Invite sent');
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Could not send invite');
    }
  };

  const runJobAction = async (id: string, action: 'pause' | 'resume' | 'run') => {
    await jobAction.mutateAsync({ id, action });
    flash(action === 'run' ? 'Running job now…' : action === 'pause' ? 'Job paused' : 'Job resumed');
  };

  const footerInitials = useMemo(() => user?.email ?? '', [user]);

  return (
    <div
      style={{
        fontFamily: "'Inter',system-ui,sans-serif",
        background: '#f6f6f8',
        color: '#18181b',
        height: '100vh',
        width: '100%',
        overflow: 'hidden',
        fontSize: 14,
        display: 'flex',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <aside style={{ width: 248, flex: 'none', background: '#fff', borderRight: '1px solid #ebebef', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 4px' }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'linear-gradient(150deg,#6d66f0,#5048d8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(80,72,216,0.32)',
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  border: '2px solid #fff',
                  borderRightColor: 'transparent',
                  transform: 'rotate(35deg)',
                }}
              />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Hermes</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: ACCENT,
                background: 'rgba(91,84,232,0.1)',
                padding: '2px 7px',
                borderRadius: 5,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
              }}
            >
              Admin
            </span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
          {NAV.map((item) => {
            const active = view === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => goTo(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  width: '100%',
                  padding: '9px 11px',
                  borderRadius: 9,
                  cursor: 'pointer',
                  fontSize: 13.5,
                  fontWeight: active ? 600 : 450,
                  marginBottom: 2,
                  border: 'none',
                  textAlign: 'left',
                  color: active ? '#18181b' : '#52525b',
                  background: active ? 'rgba(91,84,232,0.08)' : 'transparent',
                }}
              >
                <span style={{ flex: 'none', display: 'flex', color: active ? ACCENT : '#a1a1aa' }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.key === 'users' && lowCount > 0 && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      minWidth: 18,
                      height: 18,
                      padding: '0 5px',
                      borderRadius: 9,
                      background: 'rgba(220,38,38,0.1)',
                      color: '#dc2626',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {lowCount}
                  </span>
                )}
              </button>
            );
          })}

          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '9px 11px',
              borderRadius: 9,
              fontSize: 13.5,
              fontWeight: 450,
              color: '#52525b',
              textDecoration: 'none',
              marginTop: 6,
            }}
          >
            ← Back to chat
          </Link>
        </div>

        <div style={{ borderTop: '1px solid #ebebef', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px' }}>
            <Avatar seed={user?.id ?? 'admin'} name={user?.name ?? null} email={footerInitials} size={30} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 550,
                  color: '#27272a',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.name ?? user?.email}
              </div>
              <div style={{ fontSize: 11, color: '#a1a1aa' }}>Workspace admin</div>
            </div>
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div
          style={{
            height: 60,
            flex: 'none',
            background: '#fff',
            borderBottom: '1px solid #ebebef',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            gap: 20,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em' }}>{title}</h1>
            <p style={{ margin: '1px 0 0', fontSize: 12, color: '#a1a1aa' }}>{subtitle}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 'none' }}>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 11,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#a1a1aa',
                  pointerEvents: 'none',
                  display: 'flex',
                }}
              >
                <SearchIcon />
              </span>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (view !== 'users') {
                    goTo('users');
                  }
                }}
                placeholder="Search users…"
                style={{
                  width: 230,
                  background: '#f4f4f6',
                  border: '1px solid #e8e8ec',
                  borderRadius: 9,
                  padding: '8px 11px 8px 32px',
                  color: '#18181b',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setInviteError(null);
                setInviteOpen(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: ACCENT,
                border: 'none',
                borderRadius: 9,
                padding: '9px 14px',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 3px 10px rgba(91,84,232,0.28)',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1, marginTop: -1 }}>+</span> Invite user
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <div style={{ maxWidth: 1180, margin: '0 auto' }}>
            {view === 'overview' && (
              <Overview
                data={overviewQuery.data}
                isLoading={overviewQuery.isLoading}
                onOpenUser={setSelId}
              />
            )}
            {view === 'users' && (
              <UsersTable
                users={users}
                isLoading={usersQuery.isLoading}
                filter={filter}
                onFilter={setFilter}
                onOpenUser={setSelId}
              />
            )}
            {view === 'billing' && (
              <Billing
                users={billingUsers}
                isLoading={billingQuery.isLoading}
                onTopup={setTopupUser}
              />
            )}
            {view === 'jobs' && (
              <JobsTable
                jobs={jobsQuery.data?.items ?? []}
                isLoading={jobsQuery.isLoading}
                pendingId={jobAction.isPending ? jobAction.variables?.id ?? null : null}
                onAction={(id, action) => void runJobAction(id, action)}
              />
            )}
            {view === 'mcp' && <McpServers onFlash={flash} />}
            {view === 'composio' && <ComposioToolkits onFlash={flash} />}
          </div>
        </div>
      </div>

      {selId && (
        <UserDrawer
          userId={selId}
          onClose={() => setSelId(null)}
          onTopup={setTopupUser}
          onFlash={flash}
        />
      )}

      {topupUser && (
        <TopupModal
          user={topupUser}
          isPending={topup.isPending}
          onClose={() => setTopupUser(null)}
          onConfirm={(amount) => void confirmTopup(amount)}
        />
      )}

      {inviteOpen && (
        <InviteModal
          isPending={invite.isPending}
          error={inviteError}
          onClose={() => setInviteOpen(false)}
          onSend={(input) => void sendInvite(input)}
        />
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#18181b',
            borderRadius: 11,
            padding: '11px 17px',
            fontSize: 13,
            color: '#fff',
            boxShadow: '0 14px 40px rgba(0,0,0,0.28)',
            zIndex: 90,
            display: 'flex',
            alignItems: 'center',
            gap: 9,
          }}
        >
          <span style={{ color: '#34d399', display: 'flex' }}>
            <CheckIcon />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}
