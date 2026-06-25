# Credits & Usage Analytics

Two related systems, both ours: **credit metering** (charging per turn) and **usage analytics**
(reading the persisted data back). No upstream Hermes equivalent.

## Credit model

`User` credit columns (`server/prisma/schema.prisma`):

| Column | Meaning |
|--------|---------|
| `creditsPurchased` | Cumulative credits granted/bought (includes the starter grant) |
| `creditsUsed` | Cumulative credits consumed |
| `lastTopupAt` | Last top-up time |
| `hasToppedUp` | True once the user buys credits **beyond** the starter grant (free vs paid signal) |

`remaining = max(0, creditsPurchased - creditsUsed)` (`toCreditBalance`, `server/src/users/profile.ts`).

- **Starter grant:** new users get `STARTER_CREDITS = 2000` (`server/src/users/provision.ts`). An admin
  invite can override the amount; a grant is **not** a purchase, so `hasToppedUp` stays false (keeps the
  user targetable by a top-up CTA).
- **Free vs paid:** `hasToppedUp` is the flag for CTAs / limiting. There is intentionally **no upgrade
  modal** — the product nudges users to top up when credits run out.

## Metering (M5)

Per assistant turn, token usage is converted to credits and written atomically:

- `server/src/billing/meter.ts` — pure functions: `tokensUsed(usage)` and
  `creditsForUsage(usage, ratePerThousand)` = `max(1, round(tokens / 1000 * rate))`. Rate is a
  parameter (kept config-free so it's unit-testable).
- `server/src/chat/turn.ts::persistAssistantMessage` — in one `$transaction`, writes the per-turn usage
  columns onto the assistant `Message` (`inputTokens`, `outputTokens`, `totalTokens`, `creditsCharged`)
  and increments the user's `creditsUsed`.
- **Pre-flight gate** (`server/src/chat/routes.ts`): if `remaining <= 0`, the turn is refused with an SSE
  `{ code: 'insufficient_credits' }`; the client shows an out-of-credits CTA banner.

## Usage analytics from persisted data (M6)

Analytics read the **persisted `messages` rows**, so they survive the gateway's idle-session sweeps
(older conversations no longer go blank).

`server/src/billing/usage.ts`:
- `aggregateUsage(where)` — `prisma.message.aggregate` over assistant rows → `{ creditsUsed,
  totalTokens, inputTokens, outputTokens, messageCount }`.
- `dailyUsageSeries(rows, days)` — buckets credits + reply counts into per-day `UsagePoint`s for charts.

Surfaces:
- **Per-conversation** (`GET /api/conversations/:id/usage`) — DB-first via `aggregateUsage({
  conversationId })`; the live Hermes session is a best-effort overlay for fields we don't persist
  (tool/api counts, reasoning tokens, cost). Shown by `client/src/components/UsageBar.tsx`.
- **Admin overview chart** — real credits/day via `dailyUsageSeries`.
- **Admin per-user** — `AdminUserDetail.usage` (totals + 14-day sparkline in `UserDrawer`).

## Verification

- Send a few turns, then `GET /api/conversations/:id/usage` matches
  `SELECT sum(total_tokens), sum(credits_charged), count(*) FROM messages WHERE conversation_id = '…'
   AND role = 'assistant';` — and stays correct after the gateway sweeps the live session.
- Admin overview chart reflects real credits/day; a user's drawer shows credits/tokens/replies + the
  14-day sparkline.
