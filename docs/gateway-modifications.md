# Gateway Modifications (vendored fork)

`vendor/hermes-agent` is a **git submodule** pointing at our fork
(`github.com/uluumbch/hermes-agent`, branch `main`). LibreChatHermes carries a **small, surgical**
divergence from upstream so the gateway can enforce **per-user MCP toolsets and skills** per request.
This page is the canonical record of that divergence — read it before editing the gateway.

## Principle

Keep the fork **minimal and additive**. Every change is opt-in via a new optional parameter that
**defaults to upstream behavior** when absent. A stock client that never sends the new field gets
byte-identical behavior. This keeps merging upstream tractable.

---

## Part A — `allowed_toolsets` (Phase 2)

Changes in **`gateway/platforms/api_server.py`**.

### A1. New wire field: `allowed_toolsets`

The session-chat and runs request bodies now accept an optional `allowed_toolsets: string[]`. When
present and non-empty, the gateway **narrows** the agent to that subset of its configured toolsets.
We **only ever restrict** — a client can never enable a toolset the gateway isn't configured for.

### A2. `_normalize_str_list(value)` (new static method)

Lenient coercion of a request string-list to a clean `list[str]`, or `None` when absent / not a list /
empty after cleaning. **Lenient by design**: malformed input is dropped, never rejected, so a bad
client field can't break a chat turn. Shared by both `allowed_toolsets` and `allowed_skills`.

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

---

## Part B — `allowed_skills` (Phase 3)

A per-turn skill allowlist. Unlike toolsets, skills aren't a single `AIAgent` param — they surface
three ways, **all of which already consult a "disabled skills" set resolved from gateway session
context**. So the design carries an allowlist in **session context** and gates those three points.

### B1. Carrier — `gateway/session_context.py`

New `_SESSION_ALLOWED_SKILLS` contextvar (+ `_VAR_MAP` entry `HERMES_SESSION_ALLOWED_SKILLS`, an
`allowed_skills` param on `set_session_vars`, and a reset in `clear_session_vars`). Value is a
comma-joined skill-name list, set per turn and cleared after — exactly like the existing
`HERMES_SESSION_PLATFORM`.

### B2. Predicate — `agent/skill_utils.py`

- `get_allowed_skill_names() -> set[str] | None` — reads `HERMES_SESSION_ALLOWED_SKILLS` (via
  `get_session_env`, with an os.environ fallback); `None` when unset/empty = **no restriction**.
- `skill_is_allowed(name, frontmatter_name=None)` — `allowed is None or name in allowed or
  frontmatter_name in allowed`.

### B3. Enforcement points (gate next to the existing `disabled` checks)

- **`tools/skills_tool.py` → `skill_view`** — the hard gate. After the disabled check, deny
  non-allowed skills (`{success:false, error:"…not enabled for this session"}`) + `logger.warning`.
  This is what physically prevents loading a skill outside the allowlist.
- **`tools/skills_tool.py` → `_find_all_skills`** (backs `skills_list`) — skip non-allowed via the
  `_allowed(...)` wrapper.
- **`agent/prompt_builder.py` → `build_skills_system_prompt`** — read `get_allowed_skill_names()`, add
  it to the **`cache_key`** (the LRU + disk snapshot are keyed by inputs; a new filter must be in the
  key or it returns a stale index), and drop non-allowed at the three index-filter points.

### B4. Wiring — `gateway/platforms/api_server.py`

`allowed_skills` is parsed (via `_normalize_str_list`) and injected into the **two `set_session_vars`
calls** (sessions: inside `_run_agent`'s `_run`, via a new `allowed_skills_override` param threaded
from both session-chat handlers; runs: inside `_handle_runs`'s `_run_sync`), as `",".join(...)`.

### B5. Interaction

Skills are reachable only when the **"skills" toolset** is enabled for the user (`allowed_toolsets`).
`allowed_skills` narrows *which* skills within that. If the toolset allowlist omits `skills`, there are
no skill tools at all and `allowed_skills` is moot.

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
for f in gateway/platforms/api_server.py gateway/session_context.py agent/skill_utils.py \
         agent/prompt_builder.py tools/skills_tool.py; do
  python3 -m py_compile "vendor/hermes-agent/$f"; done
```

## Files touched by the fork

| File | Part | Change |
|------|------|--------|
| `gateway/platforms/api_server.py` | A + B | `_normalize_str_list`, `_create_agent`/`_run_agent` overrides, body parse + `set_session_vars` wiring |
| `gateway/session_context.py` | B | `HERMES_SESSION_ALLOWED_SKILLS` contextvar |
| `agent/skill_utils.py` | B | `get_allowed_skill_names`, `skill_is_allowed` |
| `agent/prompt_builder.py` | B | allowlist read + cache key + index filters |
| `tools/skills_tool.py` | B | `skill_view` gate + `skills_list` filter + `_allowed` helper |

## Maintaining against upstream

- The submodule tracks **our fork's `main`**. Commits to the gateway are commits in that submodule
  repo; the superproject records the submodule SHA. Commit the submodule first, then the superproject
  pointer.
- When pulling upstream hermes-agent, re-apply the additive hunks in the files above (all guarded by
  `is not None` / non-empty / allowlist checks, so they default to upstream behavior).
- Grep anchors for finding our changes: `allowed_toolsets`, `allowed_skills`, `_normalize_str_list`,
  `enabled_toolsets_override`, `allowed_skills_override`, `HERMES_SESSION_ALLOWED_SKILLS`,
  `skill_is_allowed`, `per-session toolset restriction`, `not enabled for this session`.

## Verification

1. Rebuild + restart the gateway; confirm `/health` is healthy.
2. **Toolsets** — create a session and send a chat with a restriction:
   ```bash
   KEY=$(docker compose exec -T hermes-agent sh -c 'echo $API_SERVER_KEY')
   SID=$(curl -s -X POST localhost:8642/api/sessions -H "Authorization: Bearer $KEY" \
         -H 'Content-Type: application/json' -d '{"title":"t"}' \
       | python3 -c 'import sys,json;print(json.load(sys.stdin)["session"]["id"])')
   curl -s -X POST "localhost:8642/api/sessions/$SID/chat" -H "Authorization: Bearer $KEY" \
        -H 'Content-Type: application/json' -d '{"message":"hi","allowed_toolsets":["web"]}'
   ```
   Logged at `WARNING` as `per-session toolset restriction <all> -> <subset>`.
3. **Skills** — deterministic, no LLM (exploits the os.environ fallback in `get_allowed_skill_names`):
   ```bash
   docker compose exec -T hermes-agent python -c "import os, json; \
     os.environ['HERMES_SESSION_ALLOWED_SKILLS']='claude-code'; \
     from tools.skills_tool import skills_list, skill_view; \
     print(len(json.loads(skills_list()))); \
     print(json.loads(skill_view('claude-code'))['success']); \
     print(json.loads(skill_view('codex'))['success'])"
   ```
   Expect the list narrowed to the allowed skill, allowed `skill_view` `True`, the other `False`.
4. A normal chat **without** `allowed_toolsets` / `allowed_skills` behaves exactly as before.
