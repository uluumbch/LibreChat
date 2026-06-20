import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Sidebar } from '~/components/Sidebar';
import { Composer } from '~/components/Composer';
import { MessageList } from '~/components/MessageList';
import { ApprovalPrompt } from '~/components/ApprovalPrompt';
import { SettingsModal } from '~/components/SettingsModal';
import { Spinner } from '~/components/ui';
import { useChat } from '~/chat/useChat';
import { useCreateConversation } from '~/data/queries';

interface InitialState {
  initialMessage?: string;
  agentic?: boolean;
}

function EmptyState(): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center text-zinc-400">
      <h1 className="text-2xl font-semibold text-zinc-200">Hermes Chat</h1>
      <p className="mt-2 max-w-sm text-sm">
        Start a conversation. Hermes can use its tools — you&apos;ll see each step as it works.
      </p>
    </div>
  );
}

export default function ChatPage(): JSX.Element {
  const { conversationId } = useParams();
  const convId = conversationId ?? null;
  const navigate = useNavigate();
  const location = useLocation();
  const chat = useChat(convId);
  const createConversation = useCreateConversation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const initialSentRef = useRef<string | null>(null);

  const initial = location.state as InitialState | null;

  // First message of a freshly created conversation, handed over via navigation state.
  useEffect(() => {
    if (convId && initial?.initialMessage && initialSentRef.current !== convId) {
      initialSentRef.current = convId;
      chat.send(initial.initialMessage, initial.agentic ?? false);
      navigate(`/c/${convId}`, { replace: true });
    }
  }, [convId, initial, chat, navigate]);

  const onSend = async (text: string, agentic: boolean) => {
    if (convId) {
      chat.send(text, agentic);
      return;
    }
    const conversation = await createConversation.mutateAsync({});
    navigate(`/c/${conversation.id}`, { state: { initialMessage: text, agentic } satisfies InitialState });
  };

  return (
    <div className="flex h-full bg-surface-dark text-zinc-100">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          {convId === null ? (
            <EmptyState />
          ) : chat.isLoadingHistory ? (
            <div className="flex h-full items-center justify-center text-zinc-500">
              <Spinner size={24} />
            </div>
          ) : (
            <MessageList messages={chat.messages} isStreaming={chat.isStreaming} />
          )}
        </div>
        {chat.error && (
          <div className="px-4 py-1 text-center text-xs text-red-400">{chat.error}</div>
        )}
        {chat.pendingApproval && (
          <div className="px-4 pt-2">
            <ApprovalPrompt approval={chat.pendingApproval} onRespond={chat.respondApproval} />
          </div>
        )}
        <Composer
          onSend={(text, agentic) => void onSend(text, agentic)}
          onStop={chat.stop}
          isStreaming={chat.isStreaming}
        />
      </main>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
