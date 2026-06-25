# Per-User Agent Profile

Each user has their own configured agent — **model, persona (instructions), MCP toolsets, and
skills** — that an **admin** sets up from the admin panel. This is the "soul / profile-scoped agent"
feature.

## Why this is non-trivial

The Hermes gateway is fundamentally **one configured agent shared by everyone**: its MCP toolsets,
skills, agent definition, and provider key live in the gateway's `config.yaml`. Per request, the
upstream gateway only honored **`model`** and **`system_prompt`/`instructions`**.

So "each user gets their own agent" can't be done by gateway config alone. LibreChatHermes solves it by
making **our Postgres the gateway-agnostic source of truth** for each user's profile, and applying it
through whichever gateway serves the turn. This was delivered in two phases:

- **Phase 1** — store the full profile per user + give admins a complete editor. Enforce **model +
  persona** immediately (the gateway already honors those).
- **Phase 2** — extend the gateway so **MCP toolsets** are enforced **per request** (per user), on a
  single shared pool. See [gateway-modifications.md](./gateway-modifications.md).

## Enforcement status (read this first)

| Knob | Stored & admin-editable | Enforced at the gateway | Where |
|------|:----------------------:|:-----------------------:|-------|
| **Model** | ✅ | ✅ (always) | `model` on session/run |
| **Persona / instructions** | ✅ | ✅ (always) | `system_prompt` / `instructions` |
| **MCP toolsets** (`enabledToolsets`) | ✅ | ✅ **(Phase 2)** | `allowed_toolsets` on chat/run → gateway restricts |
| **Skills** (`enabledSkills`) | ✅ | ⏳ **not yet** | stored + editable; gateway enforcement is the next step |
| **Provider API key** | ❌ (by design) | n/a | gateway-managed; "API key per user" was scoped to model/gateway selection, **not** BYOK |

> **Skills are stored and editable but not yet enforced.** The gateway has no per-request skill
> allowlist, and skills remain loadable via the `skill_view` tool regardless of the prompt index.
> Enforcing skills cleanly is the documented follow-up — see "Remaining work" below.

## Data model

`server/prisma/schema.prisma` — `User` carries the profile as **discrete, gateway-agnostic columns**
(no JSON blob, so it stays readable and queryable):

```prisma
// hermes_profile (preferences only)
model           String?
instructions    String?
memoryEnabled   Boolean  @default(true)  @map("memory_enabled")
enabledToolsets String[] @default([])    @map("enabled_toolsets")
enabledSkills   String[] @default([])    @map("enabled_skills")   // added for this feature
```

Migrations: `enabled_toolsets` predates this feature; `enabled_skills` was added in
`server/prisma/migrations/20260624170000_user_skills/`.

### `enabledToolsets` / `enabledSkills` semantics — **empty = inherit**

An **empty** list means *"no per-user restriction — inherit the gateway default"* (all configured
toolsets). A **non-empty** list is an **allowlist**. This avoids a regression: every existing user
defaults to `[]`, and `[]` must keep meaning "all tools work," not "no tools."

The server therefore sends `allowed_toolsets` **only when the list is non-empty**
(`server/src/chat/stream.ts`, `server/src/chat/runs.ts`):

```ts
allowed_toolsets: ctx.user.enabledToolsets.length > 0 ? ctx.user.enabledToolsets : undefined
```

## Code map

### Storage & mapping (server)
- `server/src/users/provision.ts` — `provisionDefaults()` seeds `enabledToolsets: []`,
  `enabledSkills: []` for new users (self-signup and admin invite).
- `server/src/users/profile.ts` — `toHermesProfile()` projects the columns into the `HermesProfile`
  API type.

### Admin API (server)
- `server/src/routes/admin.ts`
  - `GET /admin/users/:id` → `AdminUserDetail` includes the toolset catalog (`userToolsets()`), the
    skill catalog (`userSkills()`), and the user's `enabledSkills`.
  - `PATCH /admin/users/:id` accepts `model`, `instructions`, `status`, `enabledToolsets`,
    `enabledSkills`.
  - `POST /admin/invite` accepts the same optional profile fields, so an admin can configure the agent
    **at creation** (model is validated against the pool).
- `server/src/routes/settings.ts` — `PATCH /api/profile` (self-service) mirrors the same fields, so a
  user can edit their own profile (admin can still override).

### Admin UI (client)
- `client/src/components/admin/UserDrawer.tsx` — the per-user editor: model dropdown, persona
  textarea, **MCP server toggles**, **skill toggles** (each saved via `useUpdateAdminUser`). Shows a
  note that model + persona apply immediately while MCP/skills follow gateway enforcement.
- `client/src/components/admin/InviteModal.tsx` — model + persona at creation time.

### Shared types
- `shared/src/types.ts` — `HermesProfile`, `AdminUserDetail` (`enabledSkills` + `skills` catalog),
  `UpdateUserRequest`, `InviteUserRequest`.
- `shared/src/hermes.ts` — `HermesSessionChatRequest.allowed_toolsets`,
  `HermesRunRequest.allowed_toolsets` (the wire field Phase 2 added).

### Enforcement path (Phase 2)
- Server sends `allowed_toolsets` on each chat/run (`stream.ts`, `runs.ts`).
- Gateway restricts the agent's toolsets to that subset — see
  [gateway-modifications.md](./gateway-modifications.md).

## Verification

1. **Admin invite** with a model + instructions → the new user shows those values.
2. **Admin drawer** → toggle MCP servers and skills, edit model/persona, Save → reopen/reload: all
   persist. DB check:
   `SELECT model, enabled_toolsets, enabled_skills FROM users WHERE email = '…';`
3. **Model + persona live**: send a turn as that user → the gateway session is created with the
   configured model and system prompt.
4. **Toolset enforcement (Phase 2)**: with a non-empty `enabledToolsets`, send a turn → the gateway
   logs `per-session toolset restriction <all> -> <subset>` and the agent only has the allowed
   toolsets. (Sending an allowlist that intersects to empty yields an agent with **no** toolsets.)

## Remaining work (skills enforcement)

To enforce `enabledSkills` per user, the gateway needs a per-request skill allowlist. Two seams exist
in `vendor/hermes-agent`:

- `agent/prompt_builder.py::build_skills_system_prompt(available_tools, available_toolsets, …)` builds
  the skill **index** in the system prompt; it already filters by available tools/toolsets and by
  `agent/skill_utils.py::get_disabled_skill_names(platform)`.
- True enforcement also needs the **`skill_view` / `skills_list` tools** to honor the allowlist, since
  skills are loadable regardless of the prompt index.

The data path is already wired end-to-end (`enabledSkills` stored + editable); only the gateway-side
application remains. Mirror the `allowed_toolsets` thread-through (request body → `_run_agent` /
`_handle_runs` → agent) for an `allowed_skills` field.
