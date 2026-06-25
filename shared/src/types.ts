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
  enabledSkills: string[];
  /** Whether the admin has enabled Composio third-party apps for this user. */
  composioEnabled: boolean;
  /** Toolkit slugs the admin permits this user to connect (e.g. ['googledrive']). */
  composioToolkits: string[];
  /** Slash command names this user may use (empty = inherit all globally-enabled). */
  enabledCommands: string[];
}

/** Admin-managed credit balance. `remaining = purchased - used`. */
export interface CreditBalance {
  purchased: number;
  used: number;
  remaining: number;
  lastTopupAt: string | null;
}

export type AccountStatus = 'ACTIVE' | 'SUSPENDED';

/** Service tier: shared pool ("free") or the paid upgrade ("dedicated"). */
export type UserTier = 'free' | 'dedicated';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: AccountStatus;
  emailVerified: boolean;
  credits: CreditBalance;
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

/**
 * Per-conversation usage. Token/credit/message totals come from our persisted message rows
 * (durable); tool/api counts and cost are a best-effort overlay from the live Hermes session.
 */
export interface ConversationUsage {
  messageCount?: number;
  toolCallCount?: number;
  apiCallCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  creditsUsed?: number;
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

/* --------------------------- Composio (third-party apps) --------------------------- */

/** A Composio toolkit (third-party service) in the context of one user. */
export interface ComposioToolkit {
  /** Composio toolkit slug, e.g. 'googledrive', 'notion', 'googlesheets'. */
  slug: string;
  /** Human-readable name, e.g. 'Google Drive'. */
  name: string;
  /** Whether the admin has granted this user access to connect the toolkit. */
  allowed: boolean;
  /** Whether the user currently has an active connected account for the toolkit. */
  connected: boolean;
}

export interface ComposioToolkitsResponse {
  /** Whether Composio is enabled for this user at all (admin toggle). */
  enabled: boolean;
  /** Whether the gateway/server has a Composio API key configured. */
  configured: boolean;
  items: ComposioToolkit[];
}

/** Returned when initiating an OAuth connection — the URL to send the user to. */
export interface ComposioConnectResponse {
  redirectUrl: string;
}

/** A Composio toolkit in the admin catalog (live Composio entry + our enabled state). */
export interface AdminComposioToolkit {
  slug: string;
  name: string;
  logo: string | null;
  description: string | null;
  toolsCount: number | null;
  /** Whether this toolkit is enabled product-wide (grantable to users). */
  enabled: boolean;
  /** How many users currently have this toolkit granted (for the disable warning). */
  userCount: number;
}

export interface AdminComposioToolkitsResponse {
  /** Whether a Composio API key is configured on the server. */
  configured: boolean;
  items: AdminComposioToolkit[];
}

export interface ToggleComposioToolkitRequest {
  enabled: boolean;
  /** Display name to cache when enabling (defaults to the live catalog name). */
  name?: string;
}

/* --------------------------- First-party LLM providers --------------------------- */

/** Upstream protocol the gateway uses for a provider. */
export const LLM_PROVIDER_KINDS = ['gemini', 'openai', 'anthropic', 'openai-compatible'] as const;
export type LlmProviderKind = (typeof LLM_PROVIDER_KINDS)[number];

/** A model offered by a provider, in the admin catalog. */
export interface AdminLlmModel {
  /** User-facing id (unique across providers) the user selects. */
  slug: string;
  /** Upstream model id sent to the gateway. */
  modelId: string;
  label: string;
  enabled: boolean;
}

/** A registered provider in the admin catalog. The API key is never returned. */
export interface AdminLlmProvider {
  id: string;
  name: string;
  kind: LlmProviderKind;
  baseUrl: string | null;
  enabled: boolean;
  /** Whether an encrypted API key is stored (the key itself is never sent to the client). */
  hasKey: boolean;
  models: AdminLlmModel[];
}

export interface AdminLlmProvidersResponse {
  /** Whether a SECRETS_KEY is configured on the server (required to store keys). */
  configured: boolean;
  items: AdminLlmProvider[];
}

/** Create/update payload for a provider. On update, omit `apiKey` to keep the stored key. */
export interface UpsertLlmProviderRequest {
  name: string;
  kind: LlmProviderKind;
  baseUrl?: string | null;
  apiKey?: string;
  enabled?: boolean;
}

/** Create/update payload for a model under a provider. */
export interface UpsertLlmModelRequest {
  slug: string;
  modelId: string;
  label: string;
  enabled?: boolean;
}

/** A grantable model (globally enabled) with this user's grant flag, for the admin drawer. */
export interface AdminUserModel {
  slug: string;
  label: string;
  /** Provider display name, for grouping in the UI. */
  provider: string;
  allowed: boolean;
}

/* --------------------------- Slash commands (curated) --------------------------- */

/**
 * What a custom slash command does:
 * - `prompt`        — expands a template into the turn message.
 * - `skill_scope`   — restricts toolsets/skills for the turn (+ optional prompt prefix).
 * - `server_action` — server returns a fixed/queried reply, no LLM call.
 */
export type SlashCommandType = 'prompt' | 'skill_scope' | 'server_action';

/** Coded server-action handlers an admin may attach to a `server_action` command. */
export const SERVER_ACTION_KEYS = ['credits', 'help'] as const;
export type ServerActionKey = (typeof SERVER_ACTION_KEYS)[number];

/** A slash command as exposed to a user's composer autocomplete (no templates leaked). */
export interface UserSlashCommand {
  name: string;
  description: string;
  type: SlashCommandType;
}

export interface UserSlashCommandsResponse {
  items: UserSlashCommand[];
}

/** A slash command in the admin catalog (full definition). */
export interface AdminSlashCommand {
  id: string;
  name: string;
  description: string;
  type: SlashCommandType;
  enabled: boolean;
  promptTemplate: string | null;
  scopeToolsets: string[];
  scopeSkills: string[];
  promptPrefix: string | null;
  actionKey: ServerActionKey | null;
  sortOrder: number;
  /** How many users have this command in their per-user allowlist. */
  grantCount: number;
}

export interface AdminSlashCommandsResponse {
  items: AdminSlashCommand[];
}

/** Create/update payload for an admin slash command. `id` present = update. */
export interface UpsertSlashCommandRequest {
  id?: string;
  name: string;
  description: string;
  type: SlashCommandType;
  enabled?: boolean;
  promptTemplate?: string | null;
  scopeToolsets?: string[];
  scopeSkills?: string[];
  promptPrefix?: string | null;
  actionKey?: ServerActionKey | null;
  sortOrder?: number;
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

/** A globally-configured (remote) MCP server, as managed from the admin panel. */
export interface McpServer {
  name: string;
  url: string | null;
  transport: 'http' | 'sse' | string;
  /** Header keys with masked values — secrets are never returned to the client. */
  headersMasked: Record<string, string>;
  /** Whether the gateway currently has a live connection to this server. */
  connected: boolean;
}

export interface McpServersResponse {
  items: McpServer[];
}

export interface CreateMcpServerRequest {
  name: string;
  /** Must be an https:// URL — remote MCP servers only (no local command execution). */
  url: string;
  transport?: 'http' | 'sse';
  headers?: Record<string, string>;
  timeout?: number;
}

/* ------------------------------ Admin DTOs ------------------------------ */

/** A workspace member as shown in the admin Users/Credits tables. */
export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: AccountStatus;
  model: string | null;
  credits: CreditBalance;
  /** True once the user has bought credits beyond the starter grant (free vs paid). */
  hasToppedUp: boolean;
  toolsetCount: number;
  conversationCount: number;
  createdAt: string;
}

export interface AdminUsersResponse {
  items: AdminUser[];
}

/** A toolset (MCP-style connector) with this user's enabled flag, for the agent-profile drawer. */
export interface AdminUserToolset {
  name: string;
  label: string;
  description?: string;
  enabled: boolean;
}

/** Full agent profile for one user, backing the admin drawer. */
export interface AdminUserDetail extends AdminUser {
  instructions: string | null;
  memoryEnabled: boolean;
  toolsets: AdminUserToolset[];
  /** The skill catalog available on the gateway. */
  skills: SkillOption[];
  /** Names of skills enabled for this user (subset of `skills`). */
  enabledSkills: string[];
  /** Whether Composio third-party apps are enabled for this user. */
  composioEnabled: boolean;
  /** Toolkit slugs the user is permitted to connect (subset of `composioCatalog`). */
  composioToolkits: string[];
  /** The full Composio toolkit catalog the admin can choose from. */
  composioCatalog: ComposioToolkit[];
  /** Globally-enabled slash commands, each with this user's grant flag. */
  commandCatalog: AdminUserCommand[];
  /** Command names enabled for this user (subset of `commandCatalog`). */
  enabledCommands: string[];
  /** Globally-enabled first-party models, each with this user's grant flag. */
  llmCatalog: AdminUserModel[];
  /** Model slugs the user is granted (subset of `llmCatalog`). */
  allowedModels: string[];
  jobs: JobSummary[];
  usage: UserUsageSummary;
}

/** A globally-enabled slash command with this user's grant flag, for the admin drawer. */
export interface AdminUserCommand {
  name: string;
  description: string;
  type: SlashCommandType;
  allowed: boolean;
}

export interface UpdateUserRequest {
  model?: string;
  instructions?: string | null;
  status?: AccountStatus;
  enabledToolsets?: string[];
  enabledSkills?: string[];
  composioEnabled?: boolean;
  composioToolkits?: string[];
  enabledCommands?: string[];
  allowedModels?: string[];
}

export interface TopupRequest {
  /** Credits to add to the user's purchased balance. */
  amount: number;
}

export interface InviteUserRequest {
  email: string;
  name?: string;
  /** Starter credit grant added to the new user's purchased balance. */
  startingCredits?: number;
  /** Optional agent-profile config applied at creation (falls back to defaults when omitted). */
  model?: string;
  instructions?: string | null;
  enabledToolsets?: string[];
  enabledSkills?: string[];
  composioEnabled?: boolean;
  composioToolkits?: string[];
  enabledCommands?: string[];
  allowedModels?: string[];
}

/** A scheduled job paired with the user who owns it (admin-wide view). */
export interface AdminJob extends JobSummary {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
}

export interface AdminJobsResponse {
  items: AdminJob[];
}

/** One day-bucket of a consumption chart, aggregated from persisted message usage. */
export interface UsagePoint {
  /** Day label, e.g. "Jun 12". */
  label: string;
  /** Credits charged in the bucket. */
  credits: number;
  /** Assistant replies in the bucket. */
  messages: number;
}

/** Aggregated usage for one user, computed from their persisted assistant messages. */
export interface UserUsageSummary {
  creditsUsed: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
  /** Recent daily spend (most recent last), for a sparkline. */
  chart: UsagePoint[];
}

export interface AdminActivityEvent {
  id: string;
  userName: string;
  userId: string;
  action: string;
  conversationId: string;
  createdAt: string;
}

export interface AdminOverview {
  totalUsers: number;
  activeUsers: number;
  needsAttention: number;
  creditsSold: number;
  creditsRemaining: number;
  creditsUsed: number;
  /** Users still on the starter grant (never bought credits) — the free-tier CTA target. */
  neverToppedUp: number;
  chart: UsagePoint[];
  alerts: AdminUser[];
  activity: AdminActivityEvent[];
}
