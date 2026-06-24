-- Credit metering: persist per-turn usage on messages and track free-vs-paid users.
ALTER TABLE "users" ADD COLUMN "has_topped_up" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "messages"
  ADD COLUMN "input_tokens" INTEGER,
  ADD COLUMN "output_tokens" INTEGER,
  ADD COLUMN "total_tokens" INTEGER,
  ADD COLUMN "credits_charged" INTEGER;
