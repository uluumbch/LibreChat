/**
 * Normalized chat-stream event protocol (server → client) — the single source of truth for the
 * SSE contract. The server translates Hermes' native session-stream events into these typed events
 * and emits each as an SSE frame: `event: <type>\n` + `data: <json>\n\n`. The client listens per
 * `type`. Keeping this explicit (rather than multiplexing one `message` event the way LibreChat
 * does) makes the stream self-describing and the client handlers trivially typed.
 */
import type { Message, NormalizedUsage, ToolStepStatus } from './types';

export enum ChatStreamEventType {
  /** Assistant message row created; carries the ids the client should render against. */
  Created = 'created',
  /** Assistant visible-text delta. */
  Delta = 'delta',
  /** Assistant reasoning/thinking delta (rendered in a separate block). */
  Reasoning = 'reasoning',
  /** A tool invocation started or finished. */
  ToolStep = 'tool_step',
  /** An image produced by the agent. */
  Image = 'image',
  /** Conversation title (re)generated. */
  Title = 'title',
  /** Terminal success: the persisted assistant message + usage. */
  Final = 'final',
  /** Terminal error. */
  Error = 'error',
}

export interface CreatedEvent {
  type: ChatStreamEventType.Created;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
}

export interface DeltaEvent {
  type: ChatStreamEventType.Delta;
  text: string;
}

export interface ReasoningEvent {
  type: ChatStreamEventType.Reasoning;
  text: string;
}

export interface ToolStepEvent {
  type: ChatStreamEventType.ToolStep;
  toolName: string;
  status: ToolStepStatus;
  toolCallId?: string;
  label?: string;
  preview?: string;
  durationMs?: number;
}

export interface ImageEvent {
  type: ChatStreamEventType.Image;
  url: string;
  alt?: string;
}

export interface TitleEvent {
  type: ChatStreamEventType.Title;
  title: string;
}

export interface FinalEvent {
  type: ChatStreamEventType.Final;
  message: Message;
  usage?: NormalizedUsage;
}

export interface ErrorEvent {
  type: ChatStreamEventType.Error;
  message: string;
  code?: string;
}

export type ChatStreamEvent =
  | CreatedEvent
  | DeltaEvent
  | ReasoningEvent
  | ToolStepEvent
  | ImageEvent
  | TitleEvent
  | FinalEvent
  | ErrorEvent;

/** Every event name a client may subscribe to, for convenience when wiring listeners. */
export const CHAT_STREAM_EVENT_TYPES: ChatStreamEventType[] = Object.values(ChatStreamEventType);
