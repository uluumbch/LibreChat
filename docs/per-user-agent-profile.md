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
| **Toolsets & MCP** (`enabledToolsets`) | ✅ | ✅ **(Phase 2)** | `allowed_toolsets` on chat/run → gateway restricts |
| **Skills** (`enabledSkills`) | ✅ | ✅ **(Phase 3)** | `allowed_skills` on chat/run → gateway hides + hard-gates `skill_view` |
| **Provider API key** | ❌ (by design) | n/a | gateway-managed; "API key per user" was scoped to model/gateway selection, **not** BYOK |

> **Toolsets vs MCP:** the `enabledToolsets` list covers **both** the gateway's built-in toolsets
> (`web`, `browser`, `file`, …) **and** any admin-added MCP servers (each surfaces as a toolset under its
> name). MCP servers are managed globally in the admin **MCP** section; per-user control is the same
> `enabledToolsets` allowlist. See [admin-panel.md](./admin-panel.md) and
> [gateway-modifications.md](./gateway-modifications.md) Part C.

> **Skills enforcement (Phase 3):** when a user's `enabledSkills` is non-empty, the gateway hides
> non-allowed skills from `skills_list` and the prompt index, **and hard-gates `skill_view`** (the only
> way to load a skill) so the agent physically cannot use a skill outside the allowlist. Empty = inherit
> all. Skills are reachable only when the **"skills" toolset** is enabled (`enabledToolsets`);
> `enabledSkills` narrows *which* skills within that.

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
- `shared/src/hermes.ts` — `HermesSessionChatRequest` / `HermesRunRequest` carry both
  `allowed_toolsets` (Phase 2) and `allowed_skills` (Phase 3).

### Enforcement path
- **Toolsets (Phase 2):** server sends `allowed_toolsets` on each chat/run (`stream.ts`, `runs.ts`);
  the gateway restricts the agent's toolsets to that subset.
- **Skills (Phase 3):** server sends `allowed_skills`; the gateway carries it in session context and
  gates `skills_list`, the prompt index, and `skill_view`.
- Both detailed in [gateway-modifications.md](./gateway-modifications.md).

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
5. **Skill enforcement (Phase 3)** — deterministic, no LLM (exploits the os.environ fallback):
   ```bash
   docker compose exec -T hermes-agent python -c "import os, json; \
     os.environ['HERMES_SESSION_ALLOWED_SKILLS']='claude-code'; \
     from tools.skills_tool import skills_list, skill_view; \
     print(len(json.loads(skills_list()))); \
     print(json.loads(skill_view('claude-code'))['success']); \
     print(json.loads(skill_view('codex'))['success'])"
   ```
   Expect `skills_list` down to the allowed skill, the allowed `skill_view` `True`, the other `False`
   ("not enabled for this session"). With no env set, the full catalog returns and any skill loads.
