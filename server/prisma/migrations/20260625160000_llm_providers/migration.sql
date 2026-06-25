-- Admin-managed first-party LLM providers + models, plus the per-user model grant allowlist.
-- Provider API keys are encrypted at rest (api_key_enc, AES-256-GCM) and never returned to clients.

CREATE TABLE "llm_providers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "base_url" TEXT,
    "api_key_enc" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "llm_providers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "llm_models" (
    "slug" TEXT NOT NULL,
    "provider_id" UUID NOT NULL,
    "model_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "llm_models_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "llm_models_provider_id_idx" ON "llm_models"("provider_id");

ALTER TABLE "llm_models" ADD CONSTRAINT "llm_models_provider_id_fkey"
    FOREIGN KEY ("provider_id") REFERENCES "llm_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-user model grant allowlist (by llm_models.slug). Empty = only the built-in pool model.
ALTER TABLE "users" ADD COLUMN "allowed_models" TEXT[] NOT NULL DEFAULT '{}';
