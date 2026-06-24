-- Admin panel: per-user account status and admin-managed credit balances.
ALTER TABLE "users"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "credits_purchased" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "credits_used" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_topup_at" TIMESTAMP(3);
