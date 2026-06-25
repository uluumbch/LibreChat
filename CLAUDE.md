# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hermes-Chat: a multi-user web chat app whose **only** backend engine is the Hermes Agent (Nous
Research). npm-workspaces monorepo: `shared` (TS contract), `server` (Express BFF), `client` (React
SPA). The Hermes gateway lives in `vendor/hermes-agent` — a **git submodule on our fork**, not part of
the workspaces. Read `docs/` for design detail; `docs/gateway-modifications.md` is mandatory before
touching the submodule.

## Commands

Run from the repo root unless noted.

```bash
# Stack (recommended): postgres + gateway + server + client
docker compose up -d                      # server:8090  gateway:8642  client:5273  postgres:5432
docker compose logs -f server             # tail a service

# Typecheck (do this after edits — there is no separate lint)
npm run typecheck                          # shared → server → client
cd shared|server|client && npx tsc --noEmit

# Server tests (node:test via tsx). No client/shared tests exist.
cd server && npm test
cd server && node --import tsx --test src/users/quota.test.ts   # single file

# Prisma (schema in server/prisma/schema.prisma)
docker compose exec -T server sh -lc "cd server && npx prisma migrate deploy"   # apply in the running DB
cd server && npx prisma generate          # regenerate the client ON THE HOST after a new migration,
                                          # else host tsc lags the schema (the container has its own)

# Promote an admin
docker compose exec -T server sh -lc "cd server && node scripts/make-admin.mjs you@example.com"
```

Postgres creds: user `hermes`, db `hermes_chat` (e.g. `docker compose exec -T postgres psql -U hermes -d hermes_chat`).

## Critical operational gotchas

- **The gateway is a built image** (`build.context: ./vendor/hermes-agent`), NOT bind-mounted. After
  **any** Python edit you must `docker compose build hermes-agent && docker compose up -d hermes-agent`.
  `server`/`client` ARE bind-mounted (hot reload) — no rebuild for TS.
- **Secrets reach containers via `.env` → compose `${VAR}` substitution.** Changing `.env` requires
  `docker compose up -d` (recreate). `docker compose restart` keeps the **old** env — a frequent
  source of "I updated the key but still 401".
- **Submodule pushes must use SSH** — HTTPS push fails ("could not read Username"):
  `git -C vendor/hermes-agent push git@github.com:uluumbch/hermes-agent.git HEAD:main`. The submodule
  tracks the fork's `main` (often in detached HEAD). **Commit + push the submodule first, then** the
  superproject pointer, so the recorded SHA resolves.
- Gateway stderr defaults to WARNING — `logger.info` is filtered. Use `logger.warning` for anything
  that must be visible in default deployments.

## Architecture (the parts that span files)

**Gateway pool, not per-user gateways.** Hermes runs one configured agent per process; per-request it
only natively honors `model` + `instructions`. We run a small fixed pool (`HERMES_GATEWAYS` JSON, the
app owns the provider key) and isolate users at the **session** layer: a conversation → a Hermes
session id; a user → a stable session key (`user:{userId}`) scoping long-term memory. `gatewayPool`
(`server/src/hermes/pool.ts`) pins a conversation to one gateway and spreads new conversations across
the least-loaded healthy gateway (8 concurrent/gateway). `selectGateway`/`loadTurnContext`
(`server/src/chat/turn.ts`) is the topology seam.

**Two chat engines, same gateway.** Sessions engine (`server/src/chat/stream.ts` →
`/api/sessions/{id}/chat/stream`) and the agentic Runs engine (`server/src/chat/runs.ts` → `/v1/runs`,
approval gates). Both build the per-turn request body and stream Hermes events through the SSE
translator into the **normalized event protocol** defined in `shared/src/` (the contract the client
renders). When adding a per-turn capability, wire it into **both** engines.

**Our Postgres is the gateway-agnostic source of truth** for each user's profile (`User`: `model`,
`instructions`, `memoryEnabled`, `enabledToolsets`, `enabledSkills`, `composioEnabled`,
`composioToolkits`, `tier`). Profiles are **discrete columns**, not a JSON blob.

**Per-user enforcement is RESTRICT-ONLY and rides on gateway session context.** The fork
(`vendor/hermes-agent`) adds per-request fields the server sends each turn — `allowed_toolsets`,
`allowed_skills`, `composio_user_id`/`composio_toolkits` — carried as `contextvars` in
`gateway/session_context.py` (set via `set_session_vars`, read via `get_session_env` with an
`os.environ` fallback that makes them deterministically testable without an LLM). Semantics: **empty
list = inherit all** (no regression); a non-empty list is an allowlist intersected with the gateway
default. The server omits a field when its list is empty. The `composio` toolset is the exception —
appended to `enabled_toolsets` per turn (a server-driven grant), gated on toolset membership rather
than the registry `check_fn` (which is process-cached and must stay session-independent).

**Composio (third-party apps)** bridges a user's own Google Drive/Notion/Sheets accounts. Admin enables
toolkits globally (`composio_toolkits` table, `/admin/composio`) → grants per user (UserDrawer) → user
connects via OAuth (Settings → Third-Party Apps) → at chat time the gateway's `composio` meta-tool
toolset runs as that user. Same `COMPOSIO_API_KEY` in **both** server and gateway containers. All
Composio REST shape assumptions live in `server/src/composio/client.ts`; the gateway toolset is
`vendor/hermes-agent/tools/composio_tool.py`. See `docs/composio-third-party-apps.md`.

**Tiers/credits.** `tier` (`free`|`dedicated`) drives gateway selection + quota
(`server/src/users/quota.ts`, **in-memory per BFF instance** — move to Redis before multiple
replicas). Credits metered onto assistant messages (`server/src/billing/`). Tier upgrade is an
admin-only operator seam; no billing/BYOK yet.

## Conventions

- `shared` is consumed as **TS source** (no build step); import via `@hermes/shared`.
- The client talks to the server only through `apiRequest` (`client/src/api/client.ts`) + React Query
  hooks in `client/src/data/queries.ts` (keys in `keys.ts`).
- Admin routes are gated `requireAuth, requireAdmin` (`server/src/auth/middleware.ts`); role is
  resolved from the DB each request. Admin sections are real routes (`/admin/:section?`).
- Commit/push only when asked. Co-author trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
