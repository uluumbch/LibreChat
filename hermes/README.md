# Hermes-Chat

A multi-user web chat application whose **only** backend engine is
[Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research). It surfaces Hermes'
streaming, live tool-progress, images and reasoning in a familiar chat UI. The codebase is a
greenfield build that uses [LibreChat](https://github.com/danny-avila/LibreChat) as a reference for
its UI, auth, and rendering patterns — it does **not** include LibreChat's multi-provider backend.

See the design/plan in the repository root planning notes for the full architecture.

## Layout

| Workspace | Purpose |
|---|---|
| `shared/` | TypeScript contract shared by client and server: domain types, API DTOs, the normalized chat-stream **event protocol**, and Hermes API types. |
| `server/` | Express BFF (TypeScript): JWT auth, Postgres/Prisma data layer, the **gateway pool router**, the Hermes client, and the **SSE translator** (Hermes events → normalized events). |
| `client/` | React SPA: auth, chat, streaming render + tool-progress, settings. |

## Isolation model (why a "pool")

Hermes runs **one gateway process per profile** with no per-request profile switching. To serve many
users we run a small **fixed pool** of gateways (the app owns the LLM provider key) and isolate users
at the **session** layer:

- each conversation maps to a Hermes **session id** (`X-Hermes-Session-Id`),
- each user gets a stable **session key** (`X-Hermes-Session-Key: user:{userId}`) scoping long-term
  memory,
- persona/instructions are passed **per request**.

A "user profile" here is a DB-stored **preferences** record (model, persona, tool visibility, memory
toggle) — not a per-user Hermes OS profile.

## Quick start (local dev)

```bash
cd hermes
cp .env.example .env            # edit DATABASE_URL, JWT secrets, HERMES_GATEWAYS

# 1. Postgres + a Hermes gateway
docker compose up -d postgres   # see docker-compose.yml; bring your own Hermes gateway

# 2. Install + generate Prisma client + migrate
npm install
npm run db:generate
npm run db:migrate

# 3. Run
npm run dev:server              # BFF on :8090
npm run dev:client              # client on :5273
```

> **Security note:** Hermes' terminal/file tools execute on the gateway host, which is shared across
> users in the pool. Run gateways in locked-down containers and gate risky toolsets before exposing
> the app publicly. See the plan's Security section.
