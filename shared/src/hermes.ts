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
  end_reason?: string | null;
  message_count?: number;
  tool_call_count?: number;
  api_call_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  estimated_cost_usd?: number;
  actual_cost_usd?: number;
  parent_session_id?: string | null;
  last_active?: number;
  preview?: string;
}

export interface HermesCreateSessionRequest {
  id?: string;
  title?: string;
  model?: string;
  system_prompt?: string;
}

/** Multimodal content parts Hermes accepts on chat turns (OpenAI vision shape). */
export interface HermesTextContentPart {
  type: 'text';
  text: string;
}

export interface HermesImageContentPart {
  type: 'image_url';
  image_url: { url: string; detail?: 'low' | 'high' | 'auto' };
}

export type HermesContentPart = HermesTextContentPart | HermesImageContentPart;

export interface HermesSessionChatRequest {
  /** A plain prompt, or multimodal parts when the turn carries images. */
  message: string | HermesContentPart[];
  instructions?: string;
  /**
   * Per-turn MCP toolset allowlist. When set, the gateway narrows the agent to
   * this subset of its configured toolsets. Omit/empty = no restriction (inherit
   * the gateway default). See docs/per-user-agent-profile.md.
   */
  allowed_toolsets?: string[];
  /**
   * Per-turn skill allowlist. When set, the gateway restricts which skills the
   * agent can see/load (skills_list, the prompt index, and skill_view).
   * Omit/empty = no restriction. See docs/per-user-agent-profile.md.
   */
  allowed_skills?: string[];
  /**
   * Composio user id (the LibreChatHermes DB user id). When set, the gateway
   * offers the per-user `composio` toolset and scopes all third-party actions to
   * this user's connected accounts. Omit = no Composio this turn.
   */
  composio_user_id?: string;
  /** Composio toolkit allowlist (admin-granted ∩ user-connected) for this turn. */
  composio_toolkits?: string[];
  /**
   * Per-turn first-party provider override. When the user selects an admin-managed model, the
   * server injects the provider's decrypted credentials so any pooled gateway can serve it.
   * Omit/empty = inherit the gateway's process-level provider+model. See the gateway fork
   * (gateway/session_context.py) and docs/gateway-modifications.md (Part E).
   */
  provider?: string;
  model?: string;
  api_key?: string;
  base_url?: string;
  /** Wire protocol (e.g. 'chat_completions', 'anthropic_messages'). Omit = gateway auto-detects. */
  api_mode?: string;
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

export interface HermesSkill {
  name: string;
  description?: string;
  category?: string;
}

export interface HermesSkillsResponse {
  object: string;
  data: HermesSkill[];
}

/* ----------------------------- Runs API (agentic engine) ----------------------------- */

export interface HermesRunRequest {
  input: string;
  instructions?: string;
  session_id?: string;
  conversation_history?: Array<{ role: string; content: string }>;
  model?: string;
  /** Per-run MCP toolset allowlist (see HermesSessionChatRequest.allowed_toolsets). */
  allowed_toolsets?: string[];
  /** Per-run skill allowlist (see HermesSessionChatRequest.allowed_skills). */
  allowed_skills?: string[];
  /** Composio user id (see HermesSessionChatRequest.composio_user_id). */
  composio_user_id?: string;
  /** Composio toolkit allowlist (see HermesSessionChatRequest.composio_toolkits). */
  composio_toolkits?: string[];
  /** Per-run first-party provider override (see HermesSessionChatRequest.provider). */
  provider?: string;
  api_key?: string;
  base_url?: string;
  api_mode?: string;
}

export interface HermesRunCreatedResponse {
  run_id: string;
  status: string;
}

/** Run-stream event names — carried in the `event` field of each `data:` JSON frame. */
export enum HermesRunEvent {
  MessageDelta = 'message.delta',
  ToolStarted = 'tool.started',
  ToolCompleted = 'tool.completed',
  Reasoning = 'reasoning.available',
  ApprovalRequest = 'approval.request',
  ApprovalResponded = 'approval.responded',
  RunCompleted = 'run.completed',
  RunFailed = 'run.failed',
  RunCancelled = 'run.cancelled',
}

export interface HermesRunEventBase {
  event: string;
  run_id: string;
  timestamp?: number;
}

export interface HermesRunMessageDelta extends HermesRunEventBase {
  delta: string;
}

export interface HermesRunToolEvent extends HermesRunEventBase {
  tool: string;
  preview?: string;
  duration?: number;
  error?: boolean;
}

export interface HermesRunReasoning extends HermesRunEventBase {
  text: string;
}

export interface HermesRunApprovalRequest extends HermesRunEventBase {
  command?: string;
  description?: string;
  choices?: string[];
  allow_permanent?: boolean;
}

export interface HermesRunApprovalResponded extends HermesRunEventBase {
  choice: string;
  resolved?: number;
}

export interface HermesRunCompleted extends HermesRunEventBase {
  output?: string;
  usage?: HermesUsageTokens;
}

export interface HermesRunFailed extends HermesRunEventBase {
  error?: string;
}

/* ----------------------------- Jobs API (scheduled cron) ----------------------------- */

export interface HermesJob {
  id: string;
  name?: string;
  prompt?: string;
  schedule_display?: string;
  enabled?: boolean;
  state?: string;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_status?: string | null;
  last_error?: string | null;
  deliver?: string;
}

export interface HermesJobsResponse {
  jobs: HermesJob[];
}

export interface HermesJobResponse {
  job: HermesJob;
}

export interface HermesJobCreateRequest {
  name: string;
  schedule: string;
  prompt: string;
  deliver?: string;
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
