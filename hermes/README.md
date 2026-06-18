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

The stack runs the **real Hermes agent** (built from the `vendor/hermes-agent` submodule — a fork of
`NousResearch/hermes-agent`) alongside Postgres, the BFF (auto-applies Prisma migrations + hot
reloads), and the Vite client (hot reloads). Hermes exposes its OpenAI-compatible **api_server** on
`:8642`, which the BFF speaks natively. The agent calls **OpenRouter** for the LLM (no GPU needed).

**Prerequisites**

1. Fetch the agent submodule: `git submodule update --init` (from the repo root or `hermes/`).
2. Provide secrets — copy the env template and fill it in:

   ```bash
   cd hermes
   cp .env.example .env
   # set OPENROUTER_API_KEY (https://openrouter.ai/keys) and HERMES_API_KEY (any strong string)
   ```

**Run**

```bash
docker compose up --build       # first build of the Hermes image is large (Python + Node + browser)
```

Open **http://localhost:5273**, register an account, and chat — the agent streams real tokens and
live tool steps (terminal, web search, files…). The BFF is on `:8090` (`/health`), the Hermes
api_server on `:8642` (`/health`, `/v1/models`), Postgres on `:5432`. Editing source hot-reloads the
BFF/client inside their containers.

### Choosing the model

The agent's model is an **OpenRouter** model id. Set `HERMES_MODEL` in `hermes/.env` (e.g.
`nousresearch/hermes-4-405b`); leave it empty to use the default `anthropic/claude-opus-4.6`. The
name the BFF/UI shows (`hermes-agent`) is fixed via `API_SERVER_MODEL_NAME`, independent of the
underlying model. You can also change it at runtime:
`docker compose exec hermes-agent hermes config set model.default <id>` (then restart the service).

### VS Code Dev Containers

Open the `hermes/` folder and **Reopen in Container** — it uses the same compose stack and drops you
into the `server` container (`.devcontainer/devcontainer.json`). Note: the first open builds the
Hermes image, so it inherits the heavy first-build cost above.

### Production-style images

```bash
docker compose -f docker-compose.prod.yml up --build   # client (nginx) on http://localhost:8080
```

### Without Docker

Requires Node 22, a local Postgres, and a running Hermes api_server (`hermes gateway` with
`API_SERVER_ENABLED=true` + `API_SERVER_KEY`) reachable at the `baseURL` below:

```bash
cd hermes
cp server/.env.example server/.env   # edit DATABASE_URL, JWT secrets, HERMES_GATEWAYS (apiKey = API_SERVER_KEY)
npm install
npm run db:migrate
npm run dev:server                   # BFF on :8090
npm run dev:client                   # client on :5273
```

> **Security note:** the Hermes agent executes its tools (terminal, file ops, …) **inside the
> `hermes-agent` container**, using the app-owned OpenRouter key. That container is the isolation
> boundary — network-restrict it and gate risky toolsets before exposing the app publicly. The BFF
> isolates *users* at the Hermes **session** layer (`X-Hermes-Session-Key: user:{id}`), not by
> running a process per user.
