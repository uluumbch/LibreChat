# Composio Third-Party Apps (per-user connected accounts)

Lets a user's agent act on **their own** third-party accounts — **Google Drive, Notion, Google
Sheets** (catalog is extensible) — through [Composio](https://composio.dev), a hosted auth +
tool-execution bridge. An **admin** turns Composio on per user and picks which apps they may connect;
the **user** connects each app via OAuth from their own Settings. Credentials live in Composio, scoped
to that user — never in our DB, never shared.

## Why Composio (and not raw MCP)

Composio stores OAuth credentials **per user**, keyed by a `user_id` we choose (we use our DB user
UUID directly). The agent reaches those accounts at chat time. Composio's own per-user MCP URL would
require a **gateway per user** (it bakes the user into the URL) — fine for the dedicated tier, but not
the shared free pool. So instead we use Composio's **meta-tool** pattern on the shared gateway: a small,
fixed `composio` toolset whose per-user behaviour is driven entirely by **session context** — exactly
how the per-user `allowed_toolsets` / `allowed_skills` enforcement already works
([per-user-agent-profile.md](./per-user-agent-profile.md)).

## End-to-end shape

```
Admin grants user  ──►  users.composio_enabled + users.composio_toolkits  (our Postgres)
User connects app  ──►  POST /api/composio/connections/:toolkit ──► Composio OAuth ──► Composio stores creds (user_id = our UUID)
Chat turn          ──►  server sends composio_user_id + composio_toolkits to the gateway
Gateway            ──►  offers the `composio` toolset; tools run as that user via the Composio SDK
```

### Two-level model

- **Global enable (workspace):** admins curate which Composio toolkits exist for the product in the
  admin **Composio toolkits** section (`/admin/composio`). The browsable catalog is fetched **live**
  from Composio (`composio.listToolkits`); the enabled set is our own `composio_toolkits` table
  (presence of a row = enabled, name cached). Only enabled toolkits are grantable. **Disabling
  cascades:** the slug is stripped from every user's grant and all their Composio connected accounts
  for it are deleted (the UI warns with the affected-user count first). Seeded enabled on first
  migration: `googledrive`, `notion`, `googlesheets`.
- **Per-user grant:** per user, `composio_enabled` (bool) + `composio_toolkits` (⊆ the globally-enabled
  set, validated server-side). Empty list = nothing connectable. **Admin-only** — the self-service
  profile route cannot change them.
- The chat path (`server/src/chat/stream.ts`, `runs.ts`) sends `composio_user_id` + `composio_toolkits`
  **only** when `composio_enabled` and the allowlist is non-empty (`composioTurnFields()` in
  `server/src/composio/client.ts`).
- The gateway offers the `composio` toolset **only** for turns that carry a `composio_user_id` (the
  server appends it to `enabled_toolsets` per request — see
  [gateway-modifications.md](./gateway-modifications.md) Part D). Per-user gating is by toolset
  membership, **not** the registry `check_fn` (which is process-cached and so must stay
  session-independent).
- The toolset's `composio_execute_tool` additionally **rejects any tool whose toolkit is not in the
  session allowlist** (defense in depth), and every Composio call is scoped to the session `user_id`,
  so a user can only ever touch their own connected accounts.

> Note: we pass the **admin-allowed** toolkits per turn (not "connected ∩ allowed"), to avoid a
> Composio round-trip on every message. If the user hasn't connected an allowed app yet, the agent's
> execute call returns a clear "not connected" error it can relay. The live `connected` flag is
> resolved only for the Settings UI.

## Configuration

A single workspace-level Composio API key, set as an env var in **both** the server and gateway
containers (never sent to the client):

| Var | Where | Purpose |
|-----|-------|---------|
| `COMPOSIO_API_KEY` | server + gateway | Composio workspace key. Unset ⇒ feature is "not configured" (admin toggles still persist; connect/search fail clearly). |
| `COMPOSIO_BASE_URL` | server | Composio v3 REST base (default `https://backend.composio.dev/api/v3`). |
| `COMPOSIO_REDIRECT_URL` | server | Where to return the browser after OAuth (defaults to the SPA origin). |

Auth configs (per-toolkit OAuth blueprints) are **auto-created on demand** using **Composio-managed
OAuth** — the server reuses an existing auth config for a toolkit or creates one
(`ensureAuthConfig()`), so no Composio dashboard setup is required beyond the API key.

## Code map

### Gateway (`vendor/hermes-agent`)
- `tools/composio_tool.py` — the `composio` toolset: `composio_search_tools` (discover actions) +
  `composio_execute_tool` (run one as the user). Reads `HERMES_SESSION_COMPOSIO_USER_ID` /
  `HERMES_SESSION_COMPOSIO_TOOLKITS`; `check_fn` gates only global availability (API key + SDK).
- `gateway/session_context.py` — the two new session vars.
- `gateway/platforms/api_server.py` — threads `composio_user_id` / `composio_toolkits` from the
  request body into `set_session_vars`, and appends `composio` to the agent's toolsets per turn.
- `Dockerfile` — installs the `composio` Python SDK.

### Server (`server/`)
- `src/composio/catalog.ts` — DB-backed enabled set: `getEnabledToolkits` / `getEnabledSlugs` /
  `isEnabledToolkit` / `toolkitName` over the `composio_toolkits` table.
- `src/composio/client.ts` — Composio v3 REST client (auth configs, connections, `listToolkits`,
  `disconnectToolkitForAll`) + `composioTurnFields()`.
- `src/routes/composio.ts` — self-service `GET /toolkits` (enabled ∩ granted), `POST/DELETE
  /connections/:toolkit`, public `GET /callback`.
- `src/routes/admin.ts` — `composio_enabled` / `composio_toolkits` on update + invite (validated ⊆
  enabled); the user-detail catalog; the **`/admin/composio/toolkits`** GET + PATCH (toggle + cascade).
- `prisma/schema.prisma` + migrations — the two `User` columns
  (`20260625120000_user_composio`) and the `ComposioToolkit` catalog table
  (`20260625150000_composio_toolkit_catalog`, seeded).

### Client (`client/`)
- `src/components/ThirdPartyApps.tsx` — the **Settings → Third-Party Apps** tab (connect/disconnect).
- `src/components/admin/ComposioToolkits.tsx` — admin **Composio toolkits** section (search the live
  catalog, enable/disable, disable-confirm warning).
- `src/components/admin/UserDrawer.tsx` — admin enable toggle + per-toolkit allowlist (from the
  enabled set).
- `src/data/queries.ts` — `useComposioToolkits`, `useConnectComposio`, `useDisconnectComposio`,
  `useComposioAdminToolkits`, `useToggleComposioToolkit`.

## Verification

1. **Gateway toolset registers + gates (deterministic, no LLM)** — via the os.environ fallback:
   ```bash
   docker compose exec -T hermes-agent python -c "import os; \
     os.environ['COMPOSIO_API_KEY']='<key>'; \
     os.environ['HERMES_SESSION_COMPOSIO_USER_ID']='u-123'; \
     os.environ['HERMES_SESSION_COMPOSIO_TOOLKITS']='googledrive'; \
     from tools.composio_tool import composio_search_tools, check_composio_available; \
     print('available', check_composio_available()); \
     print(composio_search_tools({'query':'list files','toolkits':['googledrive']})[:200])"
   ```
   Expect `available True` and Google Drive tool slugs. With the user-id env unset, the tools return
   "not enabled for this session".
2. **Admin grant**: enable Composio + select toolkits in the UserDrawer →
   `SELECT composio_enabled, composio_toolkits FROM users WHERE email='…';`.
3. **OAuth connect**: Settings → Third-Party Apps → Connect Google Drive → finish OAuth → the app
   shows **Connected**; `GET /api/composio/toolkits` reports `connected:true`.
4. **Per-user isolation**: a second user granted only Notion cannot see/execute Google Drive; their
   chat body carries only their allowed toolkits.
5. **End-to-end**: a connected user asks "list my Google Drive files" → the agent calls
   `composio_search_tools` then `composio_execute_tool`, runs as that user, returns real results.

## Out of scope / follow-ups

- Per-user Composio MCP-URL path for dedicated-tier gateways.
- Webhook-driven connection-status sync (we query Composio live for the Settings tab).
