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

## Run with Docker (recommended)

Everything runs in containers — Postgres, the BFF (auto-applies Prisma migrations + hot reloads),
the Vite client (hot reloads), and a bundled **mock Hermes gateway** so you can try the full UI
without a real Hermes:

```bash
cd hermes
docker compose up --build
```

Open **http://localhost:5273**, register an account, and start chatting (the mock streams a canned
tool-using response). The BFF is on `:8090` (`/health`), Postgres on `:5432`. Editing source on the
host hot-reloads inside the containers.

### Point at a real Hermes gateway

Create `hermes/docker-compose.override.yml`:

```yaml
services:
  server:
    environment:
      HERMES_GATEWAYS: '[{"id":"default","model":"<model>","baseURL":"http://host.docker.internal:8642","apiKey":"<API_SERVER_KEY>"}]'
      HERMES_DEFAULT_MODEL: <model>
  mock-hermes:
    profiles: ['disabled'] # don't start the mock
```

`host.docker.internal` reaches a gateway running on your host; or use a compose service name.

### VS Code Dev Containers

Open the `hermes/` folder and **Reopen in Container** — it uses the same compose stack and drops you
into the `server` container with the toolchain (`.devcontainer/devcontainer.json`).

### Production-style images

```bash
docker compose -f docker-compose.prod.yml up --build   # client (nginx) on http://localhost:8080
```

### Without Docker

Requires Node 22 and a local Postgres:

```bash
cd hermes
cp .env.example server/.env     # edit DATABASE_URL, JWT secrets, HERMES_GATEWAYS
npm install
npm run db:migrate
npm run dev:server              # BFF on :8090
npm run dev:client              # client on :5273
```

> **Security note:** Hermes' terminal/file tools execute on the gateway host, which is shared across
> users in the pool. Run gateways in locked-down containers and gate risky toolsets before exposing
> the app publicly. See the plan's Security section.
