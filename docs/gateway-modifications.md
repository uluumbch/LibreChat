# Gateway Modifications (vendored fork)

`vendor/hermes-agent` is a **git submodule** pointing at our fork
(`github.com/uluumbch/hermes-agent`, branch `main`). LibreChatHermes carries a **small, surgical**
divergence from upstream so the gateway can enforce **per-user MCP toolsets** per request. This page is
the canonical record of that divergence — read it before editing the gateway.

## Principle

Keep the fork **minimal and additive**. Every change is opt-in via a new optional parameter that
**defaults to upstream behavior** when absent. A stock client that never sends the new field gets
byte-identical behavior. This keeps merging upstream tractable.

## What changed

All changes are in **`gateway/platforms/api_server.py`**.

### 1. New wire field: `allowed_toolsets`

The session-chat and runs request bodies now accept an optional `allowed_toolsets: string[]`. When
present and non-empty, the gateway **narrows** the agent to that subset of its configured toolsets.
We **only ever restrict** — a client can never enable a toolset the gateway isn't configured for.

### 2. `_normalize_allowed_toolsets(value)` (new static method)

Lenient coercion of the request value to a clean `list[str]`, or `None` when absent / not a list /
empty after cleaning. **Lenient by design**: malformed input is dropped, never rejected, so a bad
client field can't break a chat turn.

### 3. `_create_agent(..., enabled_toolsets_override=None)`

After resolving the gateway's configured toolsets
(`enabled_toolsets = sorted(_get_platform_tools(user_config, "api_server"))`), if an override is
provided it intersects:

```python
if enabled_toolsets_override is not None:
    allow = set(enabled_toolsets_override)
    enabled_toolsets = [t for t in enabled_toolsets if t in allow]
    logger.info("api_server: per-session toolset restriction %s -> %s", <before>, <after>)
```

`AIAgent` already accepts `enabled_toolsets`, so the restriction is native — no agent-internal changes.

### 4. Thread-through to both code paths

- **Sessions engine**: `_run_agent(..., enabled_toolsets_override=None)` forwards to `_create_agent`.
  Both session-chat handlers populate it from the body:
  - `_handle_session_chat` (non-streaming) — `POST /api/sessions/{id}/chat`
  - `_handle_session_chat_stream` (SSE) — `POST /api/sessions/{id}/chat/stream`
- **Runs engine**: `_handle_runs` (`POST /v1/runs`) parses `allowed_toolsets` and passes it to
  `_create_agent` inside its `_run_and_close` task.

### Not modified (intentionally)

The OpenAI-compat chat-completions endpoints (other `_run_agent` call sites in the same file) are
**not** wired, because LibreChatHermes drives chat exclusively through the **sessions** and **runs**
engines (`server/src/chat/stream.ts`, `server/src/chat/runs.ts`). They keep upstream behavior. Wire
them the same way if those endpoints ever enter use.

## Why a fork and not a per-user gateway

The alternative — one gateway process per user, each with its own `config.yaml` — was evaluated and
rejected for scale: ~200–500 MB RSS per process, so ~100 users ≈ 20–50 GB RAM plus heavy ops (config
render + restart per profile edit, no scale-to-zero). The fork keeps a **single shared pool** and
pushes per-user config as per-request parameters, which scales to hundreds of users cheaply. The
profile lives in our DB, so this fork is the *application point*, not the source of truth.

## Build & deploy

The `hermes-agent` Docker service is a **built image** (`build.context: ./vendor/hermes-agent`), not a
bind mount. After editing the Python you **must rebuild**:

```bash
docker compose build hermes-agent
docker compose up -d hermes-agent          # wait for healthcheck → healthy
```

Quick syntax check without a full rebuild:

```bash
python3 -m py_compile vendor/hermes-agent/gateway/platforms/api_server.py
```

## Maintaining against upstream

- The submodule tracks **our fork's `main`**. Commits to the gateway are commits in that submodule
  repo; the superproject records the submodule SHA. Commit the submodule first, then the superproject
  pointer.
- When pulling upstream hermes-agent, the conflict surface is just `api_server.py`. Re-apply the four
  additive hunks above (all guarded by `is not None` / non-empty checks).
- Grep anchors for finding our changes: `allowed_toolsets`, `_normalize_allowed_toolsets`,
  `enabled_toolsets_override`, `per-session toolset restriction`.

## Verification

1. Rebuild + restart the gateway; confirm `/health` is healthy.
2. Create a session and send a chat with a restriction:
   ```bash
   KEY=$(docker compose exec -T hermes-agent sh -c 'echo $API_SERVER_KEY')
   SID=$(curl -s -X POST localhost:8642/api/sessions -H "Authorization: Bearer $KEY" \
         -H 'Content-Type: application/json' -d '{"title":"t"}' \
       | python3 -c 'import sys,json;print(json.load(sys.stdin)["session"]["id"])')
   curl -s -X POST "localhost:8642/api/sessions/$SID/chat" -H "Authorization: Bearer $KEY" \
        -H 'Content-Type: application/json' -d '{"message":"hi","allowed_toolsets":["web"]}'
   ```
3. A normal chat **without** `allowed_toolsets` must behave exactly as before (no restriction).
4. The restriction is logged at `INFO` as `per-session toolset restriction <all> -> <subset>` (raise
   the gateway log level if INFO is filtered in your environment).
