import { useDeferredValue, useState } from 'react';
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
import { Button, Spinner } from '~/components/ui';

export function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }): JSX.Element {
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

  const deferredQuery = useDeferredValue(query);
  const searching = deferredQuery.trim().length >= 2;
  const searchQuery = useSearch(deferredQuery);

  const conversations = conversationsQuery.data?.pages.flatMap((page) => page.items) ?? [];

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

  return (
    <aside className="flex h-full w-72 flex-col border-r border-white/10 bg-surface-dark-muted">
      <div className="space-y-2 p-3">
        <Button className="w-full" onClick={() => navigate('/')}>
          + New chat
        </Button>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search conversations…"
          className="w-full rounded-lg bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/10 focus:ring-blue-500"
          aria-label="Search conversations"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {searching ? (
          <>
            {searchQuery.isLoading && (
              <div className="p-3 text-zinc-500">
                <Spinner size={16} />
              </div>
            )}
            {searchQuery.data?.items.length === 0 && (
              <div className="p-3 text-xs text-zinc-500">No matches for “{deferredQuery.trim()}”.</div>
            )}
            {searchQuery.data?.items.map(({ conversation, snippet }) => (
              <Link
                key={conversation.id}
                to={`/c/${conversation.id}`}
                className={clsx(
                  'block rounded-lg px-2 py-2',
                  conversation.id === conversationId ? 'bg-white/10' : 'hover:bg-white/5',
                )}
                title={conversation.title}
              >
                <div className="truncate text-sm text-zinc-200">{conversation.title}</div>
                {snippet && <div className="mt-0.5 truncate text-xs text-zinc-500">{snippet}</div>}
              </Link>
            ))}
          </>
        ) : (
          <>
            {conversationsQuery.isLoading && (
              <div className="p-3 text-zinc-500">
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
                    className="my-1 w-full rounded bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-none ring-1 ring-blue-500"
                  />
                );
              }
              return (
                <div
                  key={conversation.id}
                  className={clsx(
                    'group flex items-center gap-1 rounded-lg px-2',
                    active ? 'bg-white/10' : 'hover:bg-white/5',
                  )}
                >
                  <Link
                    to={`/c/${conversation.id}`}
                    className="flex-1 truncate py-2 text-sm text-zinc-200"
                    title={conversation.title}
                  >
                    {conversation.title}
                  </Link>
                  <button
                    type="button"
                    onClick={() => startRename(conversation.id, conversation.title)}
                    className="px-1 text-xs text-zinc-400 opacity-0 hover:text-zinc-100 group-hover:opacity-100"
                    aria-label="Rename conversation"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => void branch(conversation.id)}
                    className="px-1 text-xs text-zinc-400 opacity-0 hover:text-zinc-100 group-hover:opacity-100"
                    aria-label="Branch conversation"
                    title="Create a new conversation that continues from this one"
                  >
                    Branch
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(conversation.id)}
                    className="px-1 text-xs text-zinc-400 opacity-0 hover:text-red-400 group-hover:opacity-100"
                    aria-label="Delete conversation"
                  >
                    Delete
                  </button>
                </div>
              );
            })}
            {conversationsQuery.hasNextPage && (
              <button
                type="button"
                onClick={() => void conversationsQuery.fetchNextPage()}
                className="my-2 w-full rounded-lg py-2 text-xs text-zinc-400 hover:bg-white/5"
              >
                Load more
              </button>
            )}
          </>
        )}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 truncate text-xs text-zinc-400">{user?.email}</div>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1 ring-1 ring-white/10" onClick={onOpenSettings}>
            Settings
          </Button>
          <Button variant="ghost" className="ring-1 ring-white/10" onClick={() => void logout()}>
            Logout
          </Button>
        </div>
      </div>
    </aside>
  );
}
