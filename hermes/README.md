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

### Scaling the pool

`HERMES_GATEWAYS` is a JSON array, so you can run **several gateways** — including more than one for the
same model to add capacity. The router pins each conversation to a gateway (a Hermes session is
gateway-local) but spreads **new** conversations across the **least-loaded, healthy** gateway for the
requested model. Each gateway caps at 8 concurrent runs (Hermes' limit is 10); when the whole pool is
saturated a turn fails fast as a friendly `hermes_busy` rather than hanging. Gateway health is probed
in the background and updated reactively on request failures; `GET /health` returns a per-gateway
snapshot (`{ id, model, healthy, activeRuns, availableSlots }`) for observability.

Each user is also held to a **per-user quota** (`USER_MAX_CONCURRENT_TURNS`, `USER_TURNS_PER_MINUTE`)
so one account can't monopolize the pool or provider budget; over-quota turns are surfaced calmly in
the chat UI. The quota is in-memory per BFF instance — move it to a shared store (e.g. Redis) before
running multiple BFF replicas.

### Service tiers (paid-upgrade groundwork)

Each user has a **tier**: `free` (shared pool, standard limits) or `dedicated` (a higher quota —
`DEDICATED_*` — and, optionally, a **reserved gateway** their new conversations route to). An admin
grants it via `PATCH /api/admin/users/:id/tier` with `{ "tier": "dedicated", "dedicatedGatewayId":
"<pool gateway id>" }` (omit the id for higher limits on the shared pool); `{ "tier": "free" }` clears
it. This is the operator seam for the upgrade until billing exists — bring-your-own provider keys are
a later step. The tier is shown read-only in Settings.

## Run with Docker (recommended)

The stack runs the **real Hermes agent** (built from the `vendor/hermes-agent` submodule — a fork of
`NousResearch/hermes-agent`) alongside Postgres, the BFF (auto-applies Prisma migrations + hot
reloads), and the Vite client (hot reloads). Hermes exposes its OpenAI-compatible **api_server** on
`:8642`, which the BFF speaks natively. The agent calls an external LLM provider — **OpenRouter** or
**DeepSeek** — for the LLM (no GPU needed).

**Prerequisites**

1. Fetch the agent submodule: `git submodule update --init` (from the repo root or `hermes/`).
2. Provide secrets — copy the env template and fill it in:

   ```bash
   cd hermes
   cp .env.example .env
   # set HERMES_API_KEY (any strong string) and AT LEAST ONE provider key:
   #   OPENROUTER_API_KEY (https://openrouter.ai/keys) and/or
   #   DEEPSEEK_API_KEY   (https://platform.deepseek.com/api_keys)
   ```

**Run**

```bash
docker compose up --build       # first build of the Hermes image is large (Python + Node + browser)
```

Open **http://localhost:5273**, register an account, and chat — the agent streams real tokens and
live tool steps (terminal, web search, files…). The BFF is on `:8090` (`/health`), the Hermes
api_server on `:8642` (`/health`, `/v1/models`), Postgres on `:5432`. Editing source hot-reloads the
BFF/client inside their containers.

### Choosing the model / provider

Set keys in `hermes/.env` and pick the model with `HERMES_PROVIDER` / `HERMES_MODEL` (leave them
empty for the default `anthropic/claude-opus-4.6` via OpenRouter):

- **OpenRouter** (default): set `OPENROUTER_API_KEY`, then any OpenRouter id, e.g.
  `HERMES_MODEL=nousresearch/hermes-4-405b` — or DeepSeek *via* OpenRouter with
  `HERMES_MODEL=deepseek/deepseek-chat`.
- **DeepSeek (direct)**: set `DEEPSEEK_API_KEY`, then `HERMES_PROVIDER=deepseek` and
  `HERMES_MODEL=deepseek-chat` (or `deepseek-reasoner`).

The name the BFF/UI shows (`hermes-agent`) is fixed via `API_SERVER_MODEL_NAME`, independent of the
underlying model. You can also change it at runtime:
`docker compose exec hermes-agent hermes config set model.default <id>` (then restart the service).
Hermes supports many other providers too (Gemini, Groq, Novita, Kimi, …) — add the matching
`<PROVIDER>_API_KEY` to the `hermes-agent` service the same way.

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
