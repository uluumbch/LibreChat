# Admin Panel

A workspace-admin app at `/admin` for managing users, credits, scheduled jobs, and each user's agent
profile. Entirely ours (no upstream Hermes equivalent).

## Access control

### Server
- All admin routes are gated: `adminRouter.use(requireAuth, requireAdmin)`
  (`server/src/routes/admin.ts`).
- `requireAdmin = requireRole('ADMIN')` resolves the role from the **DB** on every request
  (`server/src/auth/middleware.ts`), so a role change takes effect immediately (not bound to a stale
  token). `requireRole(...roles)` is the reusable factory.

### Client (routing & guards)
`client/src/App.tsx` wraps routes in two guards:
- `RequireAuth` — bounces guests to `/login` (shows a spinner while auth status is `loading`).
- `RequireAdmin` — non-admins fall back to `/`. Because it gates **mounting**, a non-admin who opens
  `/admin` never fires admin queries (no 403 spam before redirect).

The admin link in the sidebar is only rendered for `user.role === 'ADMIN'`
(`client/src/components/Sidebar.tsx`).

## Section URLs

The admin sections are **real routes**, not local state: `/admin/:section?` →
`client/src/pages/AdminPage.tsx` derives the active tab from `useParams()` and navigates with
`useNavigate()`:

| Tab | URL |
|-----|-----|
| Overview | `/admin` |
| Users | `/admin/users` |
| Credits | `/admin/billing` |
| Scheduled jobs | `/admin/jobs` |
| MCP servers | `/admin/mcp` |

So tabs are linkable, bookmarkable, and back/forward works.

## Endpoints (`server/src/routes/admin.ts`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/overview` | Totals, credit stats, low-credit alerts, recent activity, 14-day credit chart |
| GET | `/api/admin/users?q=` | User list (searchable) |
| GET | `/api/admin/users/:id` | Full `AdminUserDetail` — profile, toolset catalog + state, skill catalog + `enabledSkills`, Composio catalog + `composioEnabled`/`composioToolkits`, jobs, usage |
| PATCH | `/api/admin/users/:id` | Update `model`, `instructions`, `status`, `enabledToolsets`, `enabledSkills`, `composioEnabled`, `composioToolkits` |
| POST | `/api/admin/users/:id/topup` | Add credits (`hasToppedUp` → true) |
| POST | `/api/admin/invite` | Create a user; optional `startingCredits` + agent profile (`model`, `instructions`, `enabledToolsets`, `enabledSkills`, `composioEnabled`, `composioToolkits`) |
| PATCH | `/api/admin/users/:id/tier` | Set `tier` (`free`/`dedicated`) + optional `dedicatedGatewayId` |
| GET | `/api/admin/jobs` | All users' scheduled (cron) jobs |
| POST | `/api/admin/jobs/:id/:action` | `pause` / `resume` / `run` a job |
| GET | `/api/admin/mcp-servers` | List global MCP servers (header secrets masked) |
| POST | `/api/admin/mcp-servers` | Add a remote (https) MCP server; live-reloaded on the gateway |
| DELETE | `/api/admin/mcp-servers/:name` | Remove an MCP server |

All `/api/admin/mcp-servers` routes proxy to the resolved gateway's new `/api/mcp-servers` endpoints
(see [gateway-modifications.md](./gateway-modifications.md) Part C).

## UI components (`client/src/components/admin/`)

- `Overview.tsx` — stat cards + 14-day **credit-consumption** chart + "needs attention" + activity feed.
- `UsersTable.tsx` — user list with filters (all / low / depleted / suspended); a **Free** badge when
  `!hasToppedUp`.
- `UserDrawer.tsx` — the per-user **agent editor** (model, persona, MCP toggles, skill toggles,
  **Composio third-party apps** enable + per-toolkit allowlist) + credit balance + usage sparkline +
  suspend/reactivate. See [per-user-agent-profile.md](./per-user-agent-profile.md) and
  [composio-third-party-apps.md](./composio-third-party-apps.md).
- `Billing.tsx` — per-user balances + top-up.
- `JobsTable.tsx` — cron jobs across users.
- `McpServers.tsx` / `McpServerModal.tsx` — global MCP server list + add (remote https only). Added
  servers appear in each user's `UserDrawer` "MCP servers" toggles for per-user restrict.
- `InviteModal.tsx` / `TopupModal.tsx` — create user / add credits.

## React Query hooks (`client/src/data/queries.ts`)

`useAdminOverview`, `useAdminUsers(q)`, `useAdminUser(id)`, `useUpdateAdminUser`, `useTopupUser`,
`useMcpServers`, `useCreateMcpServer`, `useDeleteMcpServer`,
`useInviteUser`, `useAdminJobs`, `useAdminJobAction`. Mutations invalidate the `['admin']` query branch.

## Promoting an admin

`server/scripts/make-admin.mjs <email>` sets a user's role to `ADMIN`:

```bash
docker compose exec -T server sh -lc "cd server && node scripts/make-admin.mjs you@example.com"
```

## Verification

- As a non-admin: no sidebar admin link; visiting `/admin` (or `/admin/users`) redirects to `/` with
  **no** `GET /api/admin/*` calls. Direct API probe → `403`.
- As an admin: each section loads at its own URL; back/forward switches tabs; reload keeps the tab.
