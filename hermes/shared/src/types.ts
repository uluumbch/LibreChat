/**
 * Core domain + API types shared by the Hermes-Chat client and server.
 * The database (Prisma/Postgres) models the same entities; these are the API-facing shapes.
 */

export type MessageRole = 'user' | 'assistant' | 'system';

export type ToolStepStatus = 'running' | 'completed' | 'error';

/** Discriminator for the mixed parts stored in `Message.content`. */
export enum ContentPartType {
  Text = 'text',
  Reasoning = 'reasoning',
  ToolStep = 'tool_step',
  Image = 'image',
  File = 'file',
}

export interface TextPart {
  type: ContentPartType.Text;
  text: string;
}

export interface ReasoningPart {
  type: ContentPartType.Reasoning;
  text: string;
}

export interface ToolStepPart {
  type: ContentPartType.ToolStep;
  toolName: string;
  status: ToolStepStatus;
  label?: string;
  toolCallId?: string;
  preview?: string;
  durationMs?: number;
}

export interface ImagePart {
  type: ContentPartType.Image;
  url: string;
  alt?: string;
}

export interface FilePart {
  type: ContentPartType.File;
  url: string;
  name: string;
  mimeType?: string;
}

export type MessageContentPart =
  | TextPart
  | ReasoningPart
  | ToolStepPart
  | ImagePart
  | FilePart;

/**
 * Per-user preferences ("profile"). NOT a Hermes OS profile and NOT provider credentials —
 * the LLM provider key is app-level. `model` selects which pool gateway serves the user.
 */
export interface HermesProfile {
  model: string | null;
  instructions: string | null;
  memoryEnabled: boolean;
  enabledToolsets: string[];
}

/** Service tier: shared pool ("free") or the paid upgrade ("dedicated"). */
export type UserTier = 'free' | 'dedicated';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  emailVerified: boolean;
  /** Service tier — "dedicated" grants higher limits and an optional reserved gateway. */
  tier: UserTier;
  hermesProfile: HermesProfile;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  userId: string;
  /** Hermes session id backing this conversation (assigned on first turn). */
  hermesSessionId: string | null;
  /** Which pool gateway this conversation is pinned to. */
  hermesGatewayId: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  role: MessageRole;
  text: string;
  content: MessageContentPart[];
  parentMessageId: string | null;
  finishReason: string | null;
  error: boolean;
  createdAt: string;
}

export interface NormalizedUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/* ----------------------------- Auth DTOs ----------------------------- */

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

/* ------------------------ Conversation/Message DTOs ------------------------ */

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SearchResultItem {
  conversation: Conversation;
  /** A short excerpt around the match in a message, when the hit was in message text. */
  snippet?: string;
}

export interface SearchResponse {
  items: SearchResultItem[];
}

/** Per-conversation usage, read from the backing Hermes session. */
export interface ConversationUsage {
  messageCount?: number;
  toolCallCount?: number;
  apiCallCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

/** A scheduled job (Hermes cron), scoped to the current user. */
export interface JobSummary {
  id: string;
  name: string;
  prompt: string;
  scheduleDisplay: string;
  enabled: boolean;
  state?: string;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastStatus?: string | null;
}

export interface JobsResponse {
  items: JobSummary[];
}

export interface CreateJobRequest {
  name: string;
  schedule: string;
  prompt: string;
}

export interface CreateConversationRequest {
  title?: string;
  model?: string;
}

export interface UpdateConversationRequest {
  title: string;
}

/* ------------------------------ Chat DTOs ------------------------------ */

export interface ChatImageInput {
  url: string;
  detail?: 'low' | 'high' | 'auto';
}

export interface SendMessageRequest {
  conversationId: string;
  text: string;
  images?: ChatImageInput[];
  /** Opt into the agentic Runs engine (approval gates + reasoning). Defaults to the Sessions engine. */
  agentic?: boolean;
}

/** How the user resolves a pending tool-approval gate. */
export type ApprovalChoice = 'once' | 'session' | 'always' | 'deny';

export interface ApprovalRequestBody {
  choice: ApprovalChoice;
}

/* ----------------------------- Settings DTOs ----------------------------- */

export interface UpdateProfileRequest {
  model?: string;
  instructions?: string | null;
  memoryEnabled?: boolean;
  enabledToolsets?: string[];
}

/* ----------------------------- Discovery DTOs ----------------------------- */

export interface ModelOption {
  id: string;
  label: string;
  gatewayId: string;
}

export interface ToolsetOption {
  name: string;
  label: string;
  description?: string;
  tools: string[];
}

export interface ModelsResponse {
  items: ModelOption[];
  defaultModel: string;
}

export interface ToolsetsResponse {
  items: ToolsetOption[];
}

export interface SkillOption {
  name: string;
  description?: string;
  category?: string;
}

export interface SkillsResponse {
  items: SkillOption[];
}
