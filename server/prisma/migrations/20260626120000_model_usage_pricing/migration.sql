-- Per-model usage analytics: admin-set USD price per model, and model attribution on messages.

-- USD price per 1,000,000 tokens (input / output). Null = unpriced.
ALTER TABLE "llm_models"
  ADD COLUMN "input_usd_per_mtok" DECIMAL(12,6),
  ADD COLUMN "output_usd_per_mtok" DECIMAL(12,6);

-- Model slug effective for the turn (null = built-in pool / pre-feature rows).
ALTER TABLE "messages" ADD COLUMN "model" TEXT;

-- Speeds up grouped analytics over assistant messages by date.
CREATE INDEX "messages_role_created_at_idx" ON "messages"("role", "created_at");
