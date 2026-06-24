import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ChatImageInput } from '@hermes/shared';
import { useAuth } from '~/auth/AuthContext';
import { Sidebar } from '~/components/Sidebar';
import { Composer } from '~/components/Composer';
import { MessageList } from '~/components/MessageList';
import { UsageBar } from '~/components/UsageBar';
import { ApprovalPrompt } from '~/components/ApprovalPrompt';
import { SettingsModal } from '~/components/SettingsModal';
import { JobsModal } from '~/components/JobsModal';
import { BrandMark, Spinner } from '~/components/ui';
import { useChat } from '~/chat/useChat';
import { useCreateConversation } from '~/data/queries';

interface InitialState {
  initialMessage?: string;
  agentic?: boolean;
  images?: ChatImageInput[];
}

/** Transient/expected conditions rendered calmly (amber) rather than as hard failures (red). */
const SOFT_ERROR_CODES = new Set(['hermes_busy', 'rate_limited', 'too_many_requests', 'connection']);

const SUGGESTIONS = [
  'Summarize the most recent changes in this project.',
  'Find the failing test and propose a fix.',
  'Search the web and write me a short brief.',
];

function EmptyState({ onPick }: { onPick: (text: string) => void }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center px-10 text-center">
      <div className="mb-5">
        <BrandMark size={54} radius={15} />
      </div>
      <h2 className="mb-2 text-[21px] font-semibold tracking-tight text-ink">
        What should the agent do?
      </h2>
      <p className="mb-7 max-w-[420px] text-sm leading-relaxed text-ink-muted">
        Hermes runs real tools — terminal, files, web search and installed skills — and shows every
        step. Pick a conversation or start a new one.
      </p>
      <div className="flex max-w-[520px] flex-wrap justify-center gap-2.5">
        {SUGGESTIONS.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="max-w-[240px] rounded-[11px] border border-black/[0.08] bg-white px-3.5 py-2.5 text-left text-[13px] text-ink-soft transition hover:bg-surface-input"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChatPage(): JSX.Element {
  const { conversationId } = useParams();
  const convId = conversationId ?? null;
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const chat = useChat(convId);
  const createConversation = useCreateConversation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const initialSentRef = useRef<string | null>(null);

  const initial = location.state as InitialState | null;

  // First message of a freshly created conversation, handed over via navigation state.
  useEffect(() => {
    if (!convId || initialSentRef.current === convId) {
      return;
    }
    const hasImages = (initial?.images?.length ?? 0) > 0;
    if (!initial?.initialMessage && !hasImages) {
      return;
    }
    initialSentRef.current = convId;
    chat.send(initial?.initialMessage ?? '', initial?.agentic ?? false, initial?.images);
    navigate(`/c/${convId}`, { replace: true });
  }, [convId, initial, chat, navigate]);

  const onSend = async (text: string, agentic: boolean, images: ChatImageInput[]) => {
    if (convId) {
      chat.send(text, agentic, images);
      return;
    }
    const conversation = await createConversation.mutateAsync({});
    navigate(`/c/${conversation.id}`, {
      state: { initialMessage: text, agentic, images } satisfies InitialState,
    });
  };

  const headerTitle = useMemo(() => {
    if (convId === null) {
      return 'New chat';
    }
    const firstUser = chat.messages.find((m) => m.role === 'user');
    return firstUser?.text?.trim() || 'Conversation';
  }, [convId, chat.messages]);

  const activeModel = user?.hermesProfile?.model ?? 'default';

  return (
    <div className="flex h-full bg-white text-ink">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} onOpenJobs={() => setJobsOpen(true)} />
      <main
        className="relative flex min-w-0 flex-1 flex-col"
        style={{
          background:
            'radial-gradient(900px 500px at 70% -20%, rgba(99,102,241,0.05), transparent 55%), #ffffff',
        }}
      >
        <header className="flex h-12 flex-none items-center justify-between gap-4 border-b border-black/[0.06] px-4">
          <span className="min-w-0 truncate text-[13.5px] font-medium text-ink-soft">
            {headerTitle}
          </span>
          <div className="flex flex-none items-center gap-3.5">
            {convId !== null && !chat.isLoadingHistory && <UsageBar conversationId={convId} />}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 transition hover:bg-surface-input"
              title="Model — change in Settings"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <span className="font-mono text-xs text-ink-soft">{activeModel}</span>
            </button>
          </div>
        </header>

        <div className="hm-scroll flex-1 overflow-y-auto">
          {convId === null ? (
            <EmptyState onPick={(text) => void onSend(text, false, [])} />
          ) : chat.isLoadingHistory ? (
            <div className="flex h-full items-center justify-center text-ink-faint">
              <Spinner size={24} />
            </div>
          ) : (
            <MessageList messages={chat.messages} isStreaming={chat.isStreaming} />
          )}
        </div>

        {chat.error && (
          <div
            className={`px-4 py-1 text-center text-xs ${
              SOFT_ERROR_CODES.has(chat.errorCode ?? '') ? 'text-amber-600' : 'text-red-600'
            }`}
          >
            {chat.error}
          </div>
        )}
        {chat.pendingApproval && (
          <div className="px-6 pt-2">
            <div className="mx-auto max-w-[768px]">
              <ApprovalPrompt approval={chat.pendingApproval} onRespond={chat.respondApproval} />
            </div>
          </div>
        )}
        <Composer
          onSend={(text, agentic, images) => void onSend(text, agentic, images)}
          onStop={chat.stop}
          isStreaming={chat.isStreaming}
        />
      </main>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {jobsOpen && <JobsModal onClose={() => setJobsOpen(false)} />}
    </div>
  );
}
