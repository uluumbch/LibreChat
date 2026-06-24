import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '~/auth/AuthContext';
import {
  useConversations,
  useDeleteConversation,
  useForkConversation,
  useRenameConversation,
  useSearch,
} from '~/data/queries';
import { BrandMark, Spinner } from '~/components/ui';

const iconBtn =
  'flex h-6 w-6 items-center justify-center rounded-md text-ink-muted transition hover:bg-black/[0.06]';

function PencilIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function BranchIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="9" r="2.5" />
      <path d="M6 8.5v7M8.5 6h4a3 3 0 0 1 3 3" />
    </svg>
  );
}
function TrashIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  );
}

export function Sidebar({
  onOpenSettings,
  onOpenJobs,
}: {
  onOpenSettings: () => void;
  onOpenJobs: () => void;
}): JSX.Element {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const conversationsQuery = useConversations();
  const deleteConversation = useDeleteConversation();
  const renameConversation = useRenameConversation();
  const forkConversation = useForkConversation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [accountMenu, setAccountMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const deferredQuery = useDeferredValue(query);
  const searching = deferredQuery.trim().length >= 2;
  const searchQuery = useSearch(deferredQuery);

  const conversations = conversationsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    if (!accountMenu) {
      return;
    }
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setAccountMenu(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [accountMenu]);

  const startRename = (id: string, title: string) => {
    setEditingId(id);
    setDraft(title);
  };

  const commitRename = async (id: string) => {
    const title = draft.trim();
    setEditingId(null);
    if (title) {
      await renameConversation.mutateAsync({ id, title });
    }
  };

  const remove = async (id: string) => {
    await deleteConversation.mutateAsync(id);
    if (conversationId === id) {
      navigate('/');
    }
  };

  const branch = async (id: string) => {
    const created = await forkConversation.mutateAsync(id);
    navigate(`/c/${created.id}`);
  };

  const initials = (user?.name ?? user?.email ?? 'U')
    .split(/[\s@]+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="flex h-full w-[280px] flex-none flex-col border-r border-black/[0.06] bg-surface-sidebar">
      <div className="px-3.5 pb-2.5 pt-3.5">
        <div className="flex items-center gap-2.5 px-1 pb-3.5">
          <BrandMark size={26} />
          <span className="text-[15px] font-semibold tracking-tight">Hermes</span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex w-full items-center gap-2 rounded-[10px] bg-brand px-3 py-2.5 text-[13.5px] font-semibold text-white shadow-brand transition hover:bg-brand-dark"
        >
          <span className="-mt-px text-base leading-none">+</span> New chat
        </button>
        <div className="relative mt-3">
          <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-ink-faint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="w-full rounded-[9px] border border-black/[0.07] bg-white py-2 pl-8 pr-2.5 text-[13px] text-ink outline-none transition focus:border-brand/40"
          />
        </div>
      </div>

      <div className="hm-scroll flex-1 overflow-y-auto px-2.5 pb-2.5">
        {searching ? (
          <>
            <div className="px-2 pb-2 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Results for “{deferredQuery.trim()}”
            </div>
            {searchQuery.isLoading && (
              <div className="p-3 text-ink-faint">
                <Spinner size={16} />
              </div>
            )}
            {searchQuery.data?.items.length === 0 && (
              <div className="px-2.5 py-5 text-center text-[13px] text-ink-faint">
                No matches for “{deferredQuery.trim()}”.
              </div>
            )}
            {searchQuery.data?.items.map(({ conversation, snippet }) => (
              <Link
                key={conversation.id}
                to={`/c/${conversation.id}`}
                className="mb-0.5 block rounded-[9px] px-2.5 py-2.5 transition hover:bg-black/[0.04]"
                title={conversation.title}
              >
                <div className="mb-0.5 truncate text-[13.5px] font-medium text-ink-soft">
                  {conversation.title}
                </div>
                {snippet && (
                  <div className="line-clamp-2 text-xs leading-snug text-ink-faint">{snippet}</div>
                )}
              </Link>
            ))}
          </>
        ) : (
          <>
            {conversationsQuery.isLoading && (
              <div className="p-3 text-ink-faint">
                <Spinner size={16} />
              </div>
            )}
            {conversations.map((conversation) => {
              const active = conversation.id === conversationId;
              if (editingId === conversation.id) {
                return (
                  <input
                    key={conversation.id}
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => void commitRename(conversation.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void commitRename(conversation.id);
                      }
                      if (event.key === 'Escape') {
                        setEditingId(null);
                      }
                    }}
                    className="my-0.5 w-full rounded-lg border border-brand/40 bg-white px-2.5 py-1.5 text-[13.5px] text-ink outline-none"
                  />
                );
              }
              return (
                <div
                  key={conversation.id}
                  className={clsx(
                    'group flex items-center gap-1 rounded-[9px] px-2.5 transition',
                    active
                      ? 'border border-brand/20 bg-brand/[0.12]'
                      : 'border border-transparent hover:bg-black/[0.04]',
                  )}
                >
                  <Link
                    to={`/c/${conversation.id}`}
                    className={clsx(
                      'min-w-0 flex-1 truncate py-2.5 text-[13.5px]',
                      active ? 'font-medium text-ink' : 'text-ink-soft',
                    )}
                    title={conversation.title}
                  >
                    {conversation.title}
                  </Link>
                  <div className="flex flex-none gap-px opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => startRename(conversation.id, conversation.title)}
                      className={iconBtn}
                      aria-label="Rename conversation"
                      title="Rename"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => void branch(conversation.id)}
                      className={iconBtn}
                      aria-label="Branch conversation"
                      title="Branch"
                    >
                      <BranchIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(conversation.id)}
                      className={clsx(iconBtn, 'hover:text-red-600')}
                      aria-label="Delete conversation"
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              );
            })}
            {conversationsQuery.hasNextPage && (
              <button
                type="button"
                onClick={() => void conversationsQuery.fetchNextPage()}
                className="mt-1 w-full rounded-lg py-2.5 text-center text-[12.5px] text-ink-muted transition hover:bg-black/[0.04]"
              >
                Load more
              </button>
            )}
          </>
        )}
      </div>

      <div className="relative border-t border-black/[0.06] p-2.5" ref={menuRef}>
        {accountMenu && (
          <div className="animate-hm-fade absolute bottom-[62px] left-2.5 right-2.5 rounded-xl border border-black/10 bg-white p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.13)]">
            <MenuItem onClick={() => { setAccountMenu(false); onOpenSettings(); }} label="Settings">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a7.97 7.97 0 0 0 .1-3l1.6-1.2-2-3.4-1.9.8a8 8 0 0 0-2.6-1.5L14 2h-4l-.3 2.2a8 8 0 0 0-2.6 1.5l-1.9-.8-2 3.4L4.5 12 2.9 13.2l2 3.4 1.9-.8c.8.6 1.7 1.1 2.6 1.5L10 22h4l.3-2.2c1-.4 1.8-.9 2.6-1.5" />
              </svg>
            </MenuItem>
            <MenuItem onClick={() => { setAccountMenu(false); onOpenJobs(); }} label="Jobs">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </MenuItem>
            {user?.role === 'ADMIN' && (
              <Link
                to="/admin"
                onClick={() => setAccountMenu(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink-soft transition hover:bg-black/[0.04]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5Z" />
                </svg>
                Admin panel
              </Link>
            )}
            <div className="mx-1.5 my-1 h-px bg-black/[0.07]" />
            <MenuItem onClick={() => void logout()} label="Logout">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5M21 12H9" />
              </svg>
            </MenuItem>
          </div>
        )}
        <button
          type="button"
          onClick={() => setAccountMenu((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 transition hover:bg-black/[0.04]"
        >
          <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand to-purple-600 text-xs font-semibold text-white">
            {initials}
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-[12.5px] text-ink-soft">
            {user?.email}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2">
            <path d="M5 9l7 7 7-7" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

function MenuItem({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-soft transition hover:bg-black/[0.04]"
    >
      {children}
      {label}
    </button>
  );
}
