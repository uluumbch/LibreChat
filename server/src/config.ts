import 'dotenv/config';
import { z } from 'zod';

const gatewaySchema = z.object({
  id: z.string().min(1),
  /** The model label users pick; must match what the gateway advertises at `/v1/models`. */
  model: z.string().min(1),
  baseURL: z.string().url(),
  apiKey: z.string().min(1),
});

export type GatewayConfig = z.infer<typeof gatewaySchema>;

/** Wrap a schema so an empty-string env value (how compose passes unset vars) is
 *  treated as absent rather than validated (e.g. "" must not fail `.url()`). */
function emptyToUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
}

const envSchema = z.object({
  PORT: z.coerce.number().default(8090),
  CORS_ORIGIN: z.string().default('http://localhost:5273'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(604800),
  HERMES_GATEWAYS: z.string().min(1),
  HERMES_DEFAULT_MODEL: z.string().optional(),
  USER_MAX_CONCURRENT_TURNS: z.coerce.number().int().positive().default(3),
  USER_TURNS_PER_MINUTE: z.coerce.number().int().positive().default(20),
  DEDICATED_MAX_CONCURRENT_TURNS: z.coerce.number().int().positive().default(10),
  DEDICATED_TURNS_PER_MINUTE: z.coerce.number().int().positive().default(120),
  // Credits charged per 1k tokens of metered usage (tunable without code changes).
  CREDITS_PER_1K_TOKENS: z.coerce.number().positive().default(1),
  // Composio third-party apps. Key is optional — when unset, the feature is
  // "not configured" (admin toggles still work, but connect/search fail clearly).
  // docker compose passes unset optional vars as "" — coerce empty → undefined so
  // an empty COMPOSIO_REDIRECT_URL / COMPOSIO_BASE_URL doesn't fail .url().
  COMPOSIO_API_KEY: emptyToUndefined(z.string()).optional(),
  COMPOSIO_BASE_URL: emptyToUndefined(z.string().url()).default('https://backend.composio.dev/api/v3'),
  // Where Composio sends the user after OAuth; defaults to the app settings tab.
  COMPOSIO_REDIRECT_URL: emptyToUndefined(z.string().url()).optional(),
});

function parseGateways(raw: string): GatewayConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('HERMES_GATEWAYS must be a valid JSON array');
  }
  const gateways = z.array(gatewaySchema).min(1).parse(parsed);
  const ids = new Set<string>();
  for (const gateway of gateways) {
    if (ids.has(gateway.id)) {
      throw new Error(`Duplicate gateway id in HERMES_GATEWAYS: ${gateway.id}`);
    }
    ids.add(gateway.id);
  }
  return gateways;
}

function loadConfig() {
  const env = envSchema.parse(process.env);
  const gateways = parseGateways(env.HERMES_GATEWAYS);
  const defaultModel = env.HERMES_DEFAULT_MODEL ?? gateways[0]!.model;

  if (!gateways.some((gateway) => gateway.model === defaultModel)) {
    throw new Error(`HERMES_DEFAULT_MODEL "${defaultModel}" is not served by any configured gateway`);
  }

  return {
    port: env.PORT,
    corsOrigins: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean),
    databaseUrl: env.DATABASE_URL,
    jwt: {
      accessSecret: env.JWT_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
    gateways,
    defaultModel,
    quota: {
      free: {
        maxConcurrentTurns: env.USER_MAX_CONCURRENT_TURNS,
        turnsPerMinute: env.USER_TURNS_PER_MINUTE,
      },
      dedicated: {
        maxConcurrentTurns: env.DEDICATED_MAX_CONCURRENT_TURNS,
        turnsPerMinute: env.DEDICATED_TURNS_PER_MINUTE,
      },
    },
    credits: {
      perThousandTokens: env.CREDITS_PER_1K_TOKENS,
    },
    composio: {
      apiKey: env.COMPOSIO_API_KEY ?? null,
      baseUrl: env.COMPOSIO_BASE_URL,
      redirectUrl: env.COMPOSIO_REDIRECT_URL ?? null,
    },
  } as const;
}

export const config = loadConfig();
export type AppConfig = typeof config;
