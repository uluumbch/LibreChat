-- AlterTable: service tier groundwork (free / dedicated paid tier)
ALTER TABLE "users" ADD COLUMN "tier" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "users" ADD COLUMN "dedicated_gateway_id" TEXT;
