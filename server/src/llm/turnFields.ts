/**
 * Per-turn first-party provider override for the gateway chat/run body. Returns an empty object
 * (nothing sent → gateway inherits its process-level provider+model) unless the user's selected
 * model is an admin-managed, enabled model. When it is, we decrypt the provider key and send
 * provider/model/api_key/base_url so any pooled gateway can serve that model for this turn.
 *
 * The api_key is decrypted only here, only for the turn, and must never be logged.
 */
import type { LlmProviderKind } from '@hermes/shared';
import { resolveModel } from './catalog';
import { decrypt } from '../crypto/secrets';

export interface LlmTurnFields {
  provider?: string;
  model?: string;
  api_key?: string;
  base_url?: string;
  api_mode?: string;
}

/**
 * Map an admin provider `kind` + optional base URL to the gateway wire fields (hermes provider id,
 * endpoint, and protocol). Gemini and OpenAI-compatible go over OpenAI's chat-completions shape;
 * OpenAI-direct lets the gateway auto-detect the mode from its host; Anthropic uses its messages API.
 */
function providerWire(
  kind: LlmProviderKind,
  baseUrl: string | null,
): { provider: string; base_url?: string; api_mode?: string } {
  switch (kind) {
    case 'gemini':
      return {
        provider: 'openai',
        base_url: baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta/openai/',
        api_mode: 'chat_completions',
      };
    case 'anthropic':
      return { provider: 'anthropic', base_url: baseUrl ?? 'https://api.anthropic.com', api_mode: 'anthropic_messages' };
    case 'openai':
      // Omit api_mode: the gateway auto-detects (api.openai.com needs the Responses API).
      return { provider: 'openai', ...(baseUrl ? { base_url: baseUrl } : {}) };
    case 'openai-compatible':
      // baseUrl is required for this kind (admin route validates it).
      return { provider: 'openai', base_url: baseUrl ?? undefined, api_mode: 'chat_completions' };
  }
}

/**
 * @param modelSlug the model selected for this turn (conversation.model ?? user.model). When it
 *   isn't an enabled first-party model (e.g. the built-in pool model, or null), returns `{}`.
 */
export async function llmTurnFields(modelSlug: string | null | undefined): Promise<LlmTurnFields> {
  if (!modelSlug) return {};
  const resolved = await resolveModel(modelSlug);
  if (!resolved) return {};
  const wire = providerWire(resolved.provider.kind, resolved.provider.baseUrl);
  return {
    ...wire,
    model: resolved.modelId,
    api_key: decrypt(resolved.provider.apiKeyEnc),
  };
}
