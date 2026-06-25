# Architecture

How LibreChatHermes is put together, and the seams that matter when extending it.

## Workspaces

npm workspaces monorepo:

- **`shared/`** (`@hermes/shared`) — TypeScript types only, consumed as source (`main` →
  `./src/index.ts`, no build). Two type groups: app DTOs (`shared/src/types.ts`) and the gateway wire
  contract (`shared/src/hermes.ts`).
- **`server/`** — Express API, Prisma ORM (PostgreSQL), JWT auth. Talks to the gateway pool.
- **`client/`** — React SPA (Vite, Tailwind, React Query, React Router). Talks only to `server/`.

## Request lifecycle (a chat turn)

1. Client opens an SSE request to the server (`POST /api/chat`...).
2. Server authenticates (JWT), enforces **quota** (`server/src/users/quota.ts`) and **credits**
   (pre-flight balance check in `server/src/chat/routes.ts`).
3. Server loads a **TurnContext** (`loadTurnContext`, `server/src/chat/turn.ts`) — the user row, the
   conversation, and the chosen pooled gateway.
4. Server ensures a Hermes **session** exists (`ensureSession`) and streams the turn through one of the
   two engines (below).
5. Token usage is metered onto the assistant `Message` and the user's `creditsUsed` in a transaction
   (`persistAssistantMessage` → `server/src/billing/meter.ts`).

## The gateway pool

`server/src/hermes/pool.ts` builds a `GatewayPool` from the `HERMES_GATEWAYS` env var (a JSON array of
`{ id, model, baseURL, apiKey }`). Each entry is one gateway process serving one model with one shared
provider key.

`selectGateway(pool, conversation, user)` (`server/src/chat/turn.ts`) picks the gateway for a turn,
in priority order:

1. **Pinned** — the conversation's `hermesGatewayId` (Hermes sessions are gateway-local, so once a
   conversation has a session it stays on that gateway).
2. **Dedicated** — `user.tier === 'dedicated' && user.dedicatedGatewayId` (a reserved gateway).
3. **Shared pool** — `pool.resolve(conversation.model ?? user.model)` (least-loaded healthy gateway
   serving that model).

> `selectGateway()` is the **topology seam**. Per-user agent config is stored in our DB and applied
> *through* whichever gateway is selected — see [per-user-agent-profile.md](./per-user-agent-profile.md).

## Two chat engines

The server can drive a turn two ways; both live under `server/src/chat/`:

- **Sessions engine** (`stream.ts`) — `POST /api/sessions/{id}/chat/stream` on the gateway. Stateful
  session transcript on the gateway side.
- **Runs engine** (`runs.ts`) — `POST /v1/runs` on the gateway. Agentic runs with approval gates;
  conversation history is sent explicitly.

Both send the user's `model` + `instructions` (persona) and, as of Phase 2, the per-user
**`allowed_toolsets`** (MCP allowlist).

## Tiers & quota

- **Tier** (`user.tier`: `free` | `dedicated`) drives both gateway selection (above) and quota.
- **Quota** (`server/src/users/quota.ts`) — token-bucket rate limit + concurrency cap, per tier
  (`config.quota.free` / `config.quota.dedicated`). Enforced at turn submission in
  `server/src/chat/routes.ts`.

## Persistence model (Prisma)

`server/prisma/schema.prisma`, key models:

- **User** — identity + credits + tier + the per-user agent **profile** (`model`, `instructions`,
  `memoryEnabled`, `enabledToolsets`, `enabledSkills`). See the profile doc.
- **Conversation** — `model`, `hermesSessionId`, `hermesGatewayId` (gateway pinning).
- **Message** — content + per-turn usage (`inputTokens`, `outputTokens`, `totalTokens`,
  `creditsCharged`).

Migrations are in `server/prisma/migrations/`; the Docker `server` service runs
`db:generate && db:deploy` on start.

## Auth

JWT access token (short-lived) + refresh cookie. Middleware in `server/src/auth/middleware.ts`:
`requireAuth`, and `requireRole(...roles)` with `requireAdmin = requireRole('ADMIN')`. The client
mirrors this with route guards — see [admin-panel.md](./admin-panel.md).
