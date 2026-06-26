import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SSE } from 'sse.js';
import type {
  ApprovalChoice,
  ApprovalEvent,
  ChatImageInput,
  CreatedEvent,
  DeltaEvent,
  FinalEvent,
  Message,
  MessageContentPart,
  ReasoningEvent,
  TitleEvent,
  ToolStepEvent,
} from '@hermes/shared';
import { ChatStreamEventType, ContentPartType } from '@hermes/shared';
import { useAuth } from '~/auth/AuthContext';
import { apiRequest } from '~/api/client';
import { useMessages } from '~/data/queries';
import { queryKeys } from '~/data/keys';

function nowIso(): string {
  return new Date().toISOString();
}

function emptyAssistant(id: string, conversationId: string, parentMessageId: string): Message {
  return {
    id,
    conversationId,
    userId: '',
    role: 'assistant',
    text: '',
    content: [],
    parentMessageId,
    finishReason: null,
    error: false,
    createdAt: nowIso(),
  };
}

export interface UseChatResult {
  messages: Message[];
  isStreaming: boolean;
  error: string | null;
  /** Error classifier so the UI can render transient issues (busy/connection) calmly. */
  errorCode: string | null;
  isLoadingHistory: boolean;
  /** A pending tool-approval gate (agentic engine), or null. */
  pendingApproval: ApprovalEvent | null;
  send: (text: string, agentic?: boolean, images?: ChatImageInput[]) => void;
  respondApproval: (choice: ApprovalChoice) => void;
  stop: () => void;
}

/**
 * Owns the message list for the active conversation: seeds it from history, then drives a live turn
 * by opening an SSE to `/api/chat` and folding our normalized events into the assistant message.
 * With `agentic`, the turn runs through the Runs engine and may pause on an approval gate.
 */
export function useChat(conversationId: string | null): UseChatResult {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const historyQuery = useMessages(conversationId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalEvent | null>(null);

  const sseRef = useRef<SSE | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const finishedRef = useRef(false);
  const seededConvRef = useRef<string | null>(null);

  useEffect(() => {
    // Conversation actually switched → adopt its history (or empty) outright.
    if (seededConvRef.current !== conversationId) {
      seededConvRef.current = conversationId;
      setMessages(historyQuery.data?.items ?? []);
      return;
    }
    // Same conversation, history (re)loaded: only adopt it if we have no local
    // turn in flight, so an empty/late GET can't wipe the optimistic message.
    if (historyQuery.data) {
      setMessages((prev) => (prev.length > 0 ? prev : historyQuery.data!.items));
    }
  }, [conversationId, historyQuery.data]);

  // Tear down any active stream when the conversation changes or on unmount.
  useEffect(() => {
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [conversationId]);

  const patchAssistant = useCallback((updater: (content: MessageContentPart[], message: Message) => Message) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantIdRef.current ? updater([...message.content], message) : message,
      ),
    );
  }, []);

  const appendText = useCallback(
    (text: string) => {
      patchAssistant((content, message) => {
        const last = content.at(-1);
        if (last && last.type === ContentPartType.Text) {
          content[content.length - 1] = { ...last, text: last.text + text };
        } else {
          content.push({ type: ContentPartType.Text, text });
        }
        return { ...message, text: message.text + text, content };
      });
    },
    [patchAssistant],
  );

  const appendReasoning = useCallback(
    (text: string) => {
      patchAssistant((content, message) => {
        const last = content.at(-1);
        if (last && last.type === ContentPartType.Reasoning) {
          content[content.length - 1] = { ...last, text: last.text + text };
        } else {
          content.push({ type: ContentPartType.Reasoning, text });
        }
        return { ...message, content };
      });
    },
    [patchAssistant],
  );

  const upsertToolStep = useCallback(
    (step: ToolStepEvent) => {
      patchAssistant((content, message) => {
        if (step.status === 'running') {
          content.push({
            type: ContentPartType.ToolStep,
            toolName: step.toolName,
            status: 'running',
            label: step.label,
            preview: step.preview,
            toolCallId: step.toolCallId,
          });
        } else {
          for (let i = content.length - 1; i >= 0; i -= 1) {
            const part = content[i];
            if (part && part.type === ContentPartType.ToolStep && part.toolName === step.toolName && part.status === 'running') {
              content[i] = { ...part, status: step.status, preview: step.preview ?? part.preview };
              break;
            }
          }
        }
        return { ...message, content };
      });
    },
    [patchAssistant],
  );

  const finish = useCallback(() => {
    finishedRef.current = true;
    setIsStreaming(false);
    setPendingApproval(null);
    assistantIdRef.current = null;
    sseRef.current = null;
  }, []);

  const send = useCallback(
    (text: string, agentic = false, images: ChatImageInput[] = []) => {
      const trimmed = text.trim();
      if (!conversationId || isStreaming || (trimmed.length === 0 && images.length === 0)) {
        return;
      }
      setError(null);
      setErrorCode(null);
      setIsStreaming(true);
      setPendingApproval(null);
      finishedRef.current = false;

      const userContent: MessageContentPart[] = [];
      if (trimmed) {
        userContent.push({ type: ContentPartType.Text, text: trimmed });
      }
      for (const image of images) {
        userContent.push({ type: ContentPartType.Image, url: image.url });
      }

      const tempUserId = `temp-user-${Date.now()}`;
      const optimisticUser: Message = {
        id: tempUserId,
        conversationId,
        userId: '',
        role: 'user',
        text: trimmed,
        content: userContent,
        parentMessageId: null,
        finishReason: null,
        error: false,
        createdAt: nowIso(),
      };
      setMessages((prev) => [...prev, optimisticUser]);

      const sse = new SSE('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        payload: JSON.stringify({ conversationId, text: trimmed, images, agentic }),
      });
      sseRef.current = sse;

      sse.addEventListener(ChatStreamEventType.Created, (event: MessageEvent) => {
        const data = JSON.parse(event.data) as CreatedEvent;
        assistantIdRef.current = data.assistantMessageId;
        setMessages((prev) => {
          const reconciled = prev.map((message) =>
            message.id === tempUserId ? { ...message, id: data.userMessageId } : message,
          );
          return [
            ...reconciled,
            emptyAssistant(data.assistantMessageId, conversationId, data.userMessageId),
          ];
        });
      });

      sse.addEventListener(ChatStreamEventType.Delta, (event: MessageEvent) => {
        appendText((JSON.parse(event.data) as DeltaEvent).text);
      });

      sse.addEventListener(ChatStreamEventType.Reasoning, (event: MessageEvent) => {
        appendReasoning((JSON.parse(event.data) as ReasoningEvent).text);
      });

      sse.addEventListener(ChatStreamEventType.ToolStep, (event: MessageEvent) => {
        upsertToolStep(JSON.parse(event.data) as ToolStepEvent);
      });

      sse.addEventListener(ChatStreamEventType.Approval, (event: MessageEvent) => {
        setPendingApproval(JSON.parse(event.data) as ApprovalEvent);
      });

      sse.addEventListener(ChatStreamEventType.ApprovalResolved, () => {
        setPendingApproval(null);
      });

      sse.addEventListener(ChatStreamEventType.Title, (event: MessageEvent) => {
        void (JSON.parse(event.data) as TitleEvent);
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      });

      sse.addEventListener(ChatStreamEventType.Final, (event: MessageEvent) => {
        const data = JSON.parse(event.data) as FinalEvent;
        const finalId = assistantIdRef.current;
        setMessages((prev) => prev.map((message) => (message.id === finalId ? data.message : message)));
        finish();
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
        void queryClient.invalidateQueries({ queryKey: queryKeys.usage(conversationId) });
      });

      sse.addEventListener(ChatStreamEventType.Error, (event: MessageEvent) => {
        let message = 'Something went wrong';
        let code: string | undefined;
        try {
          const data = JSON.parse(event.data) as { message?: string; code?: string };
          message = data.message ?? message;
          code = data.code;
        } catch {
          // non-JSON error payload
        }
        setError(message);
        setErrorCode(code ?? null);
        const failedId = assistantIdRef.current;
        if (failedId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === failedId ? { ...m, error: true } : m)),
          );
        }
        finish();
      });

      sse.addEventListener('error', () => {
        if (finishedRef.current) {
          return;
        }
        setError('Connection lost — please try again.');
        setErrorCode('connection');
        finish();
      });

      sse.stream();
    },
    [conversationId, isStreaming, token, appendText, appendReasoning, upsertToolStep, finish, queryClient],
  );

  const respondApproval = useCallback(
    (choice: ApprovalChoice) => {
      const runId = pendingApproval?.runId;
      if (!runId) {
        return;
      }
      setPendingApproval(null);
      void apiRequest('POST', `/api/chat/runs/${encodeURIComponent(runId)}/approval`, { choice }).catch(
        (err: unknown) => {
          setError(err instanceof Error ? err.message : 'Approval failed');
        },
      );
    },
    [pendingApproval],
  );

  const stop = useCallback(() => {
    sseRef.current?.close();
    finish();
  }, [finish]);

  return {
    messages,
    isStreaming,
    error,
    errorCode,
    isLoadingHistory: historyQuery.isLoading && conversationId !== null,
    pendingApproval,
    send,
    respondApproval,
    stop,
  };
}
