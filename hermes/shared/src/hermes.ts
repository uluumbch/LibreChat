/**
 * Types for the Hermes Agent HTTP API (v0.16), covering the surfaces this app uses:
 * Sessions API (incl. `/chat/stream`), discovery, and the chat-completions tool-progress event.
 * Field names mirror Hermes' on-the-wire JSON (snake_case) so parsing stays honest.
 */

/* ------------------------------ Sessions ------------------------------ */

export interface HermesSession {
  id: string;
  source?: string;
  model?: string;
  title?: string;
  started_at?: number;
  ended_at?: number | null;
  message_count?: number;
  tool_call_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  last_active?: number;
  preview?: string;
}

export interface HermesCreateSessionRequest {
  id?: string;
  title?: string;
  model?: string;
  system_prompt?: string;
}

export interface HermesSessionChatRequest {
  message: string;
  instructions?: string;
}

export interface HermesUsageTokens {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

/* --------------------- Session `/chat/stream` events --------------------- */

export enum HermesStreamEvent {
  RunStarted = 'run.started',
  MessageStarted = 'message.started',
  AssistantDelta = 'assistant.delta',
  ToolStarted = 'tool.started',
  ToolCompleted = 'tool.completed',
  AssistantCompleted = 'assistant.completed',
  RunCompleted = 'run.completed',
  Done = 'done',
}

export interface HermesRunStartedData {
  session_id: string;
  run_id: string;
  seq: number;
  ts: number;
}

export interface HermesMessageStartedData {
  message: { id: string; role: string };
  seq: number;
  ts: number;
}

export interface HermesAssistantDeltaData {
  message_id: string;
  delta: string;
  seq: number;
  ts: number;
}

export interface HermesToolEventData {
  message_id: string;
  tool_name: string;
  preview?: string;
  seq: number;
  ts: number;
}

export interface HermesAssistantCompletedData {
  session_id: string;
  message_id: string;
  content: string;
  completed: boolean;
  seq: number;
  ts: number;
}

export interface HermesRunCompletedData {
  session_id: string;
  message_id: string;
  completed: boolean;
  usage?: HermesUsageTokens;
  seq: number;
  ts: number;
}

/* ------------------- chat/completions tool-progress event ------------------- */

export interface HermesToolProgressData {
  tool: string;
  emoji?: string;
  label?: string;
  toolCallId?: string;
  status: 'running' | 'completed' | 'error';
}

/* ------------------------------ Discovery ------------------------------ */

export interface HermesModel {
  id: string;
  object: string;
  owned_by?: string;
}

export interface HermesModelsResponse {
  object: string;
  data: HermesModel[];
}

export interface HermesToolset {
  name: string;
  label: string;
  description?: string;
  enabled?: boolean;
  configured?: boolean;
  tools: string[];
}

export interface HermesToolsetsResponse {
  object: string;
  platform?: string;
  data: HermesToolset[];
}

export interface HermesCapabilitiesResponse {
  object: string;
  platform?: string;
  model?: string;
  features?: Record<string, boolean | string>;
}

export interface HermesHealthResponse {
  status: string;
  platform?: string;
  version?: string;
  gateway_state?: string;
}

/** Header names Hermes recognizes for session continuity + memory scoping. */
export const HERMES_SESSION_ID_HEADER = 'X-Hermes-Session-Id';
export const HERMES_SESSION_KEY_HEADER = 'X-Hermes-Session-Key';
