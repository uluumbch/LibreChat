-- Admin-managed Composio toolkit catalog: presence of a row = globally enabled.
CREATE TABLE "composio_toolkits" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "composio_toolkits_pkey" PRIMARY KEY ("slug")
);

-- Seed the toolkits the build already used so existing per-user grants keep working.
INSERT INTO "composio_toolkits" ("slug", "name") VALUES
    ('googledrive', 'Google Drive'),
    ('notion', 'Notion'),
    ('googlesheets', 'Google Sheets')
ON CONFLICT ("slug") DO NOTHING;
