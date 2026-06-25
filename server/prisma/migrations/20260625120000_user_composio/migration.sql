-- Composio third-party apps: per-user enablement + the toolkit allowlist the
-- admin permits the user to connect (gateway-bridged connected accounts).
ALTER TABLE "users" ADD COLUMN "composio_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "composio_toolkits" TEXT[] NOT NULL DEFAULT '{}';
