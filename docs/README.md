# LibreChatHermes — Documentation

This folder documents **everything LibreChatHermes adds, changes, or removes relative to a stock
[Hermes agent](https://github.com/uluumbch/hermes-agent) deployment**. It is written to be read by
both human programmers and AI coding agents: every feature page names the real files, the data flow,
and the exact divergence from upstream.

> **What is LibreChatHermes?**
> A multi-tenant chat product built **on top of** the Hermes agent gateway. Users chat with an
> AI agent; admins manage users, credits, and each user's agent configuration. The Hermes gateway
> (a Python service) is vendored as a git submodule and does the actual LLM/agent work; everything
> else — auth, accounts, persistence, billing, the admin panel, the chat UI — is our code.

## Repository shape

| Path | What it is | Ours / upstream |
|------|------------|-----------------|
| `server/` | Express + Prisma (PostgreSQL) API | **ours** |
| `client/` | React + Vite + Tailwind + React Query SPA | **ours** |
| `shared/` | `@hermes/shared` — TypeScript types shared by server + client | **ours** |
| `vendor/hermes-agent/` | The Hermes gateway (Python), a git submodule | **upstream fork** — see [gateway-modifications.md](./gateway-modifications.md) |
| `docs/` | This documentation | **ours** |

The app was originally nested under `/hermes` inside a LibreChat checkout; it has since been
**flattened to the repo root** and the LibreChat code removed. The gateway submodule lives at
`vendor/hermes-agent`.

## How the pieces talk

```
 Browser ──HTTP/SSE──> server (Express)  ──HTTP/SSE──> hermes-agent gateway (Python)
   client/                  server/                       vendor/hermes-agent/
        \__ React Query        \__ Prisma → PostgreSQL        \__ AIAgent + toolsets + skills
```

- The server owns **identity, accounts, conversations, messages, credits** (Postgres via Prisma).
- The gateway owns **the agent loop, model calls, MCP toolsets, skills** (its own `config.yaml`).
- The server talks to the gateway through a **pool** (`server/src/hermes/pool.ts`) and picks a gateway
  per turn via `selectGateway()` (`server/src/chat/turn.ts`).

## Feature documentation

| Doc | Covers |
|-----|--------|
| [architecture.md](./architecture.md) | System overview, gateway pool, the two chat engines, tiers/quota |
| [per-user-agent-profile.md](./per-user-agent-profile.md) | Per-user model / persona / MCP toolsets / skills — admin-configured. Phase 1 (storage + UI) and Phase 2 (gateway enforcement) |
| [admin-panel.md](./admin-panel.md) | Admin app: overview, users, credits, jobs; role-based routing & guards |
| [credits-and-usage.md](./credits-and-usage.md) | Credit metering (M5) and usage analytics from persisted data (M6) |
| [gateway-modifications.md](./gateway-modifications.md) | **Exactly** what we changed in the vendored `hermes-agent` Python and how to maintain it vs upstream |

## Conventions used in these docs

- **File references** are clickable repo-relative paths, sometimes with `:line` (lines drift — treat as
  a starting point, search the named symbol if it moved).
- **"Upstream"** = stock hermes-agent behavior. **"Ours"** = LibreChatHermes additions.
- Each feature page ends with a **Verification** section: how to prove it works end-to-end.

## For AI agents working in this repo

- Source of truth for per-user config is **our Postgres `users` table**, not the gateway. The gateway
  is intentionally swappable behind `selectGateway()`.
- The gateway is a **fork** — before editing `vendor/hermes-agent`, read
  [gateway-modifications.md](./gateway-modifications.md) so you don't clobber our changes or assume
  upstream behavior.
- `@hermes/shared` is consumed as **TypeScript source** (no build step); changing a type there is
  immediately visible to server + client typechecks.
- Run the stack with `docker compose up`; the gateway is a **built image** (rebuild after Python
  edits: `docker compose build hermes-agent`), while server/client bind-mount the repo.
