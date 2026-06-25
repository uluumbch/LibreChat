-- AlterTable
ALTER TABLE "users" ADD COLUMN     "enabled_commands" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "slash_commands" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "prompt_template" TEXT,
    "scope_toolsets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scope_skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prompt_prefix" TEXT,
    "action_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slash_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slash_commands_name_key" ON "slash_commands"("name");
