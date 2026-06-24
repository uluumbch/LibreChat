-- Per-user agent profile: skills the user's agent may use (gateway-agnostic; mirrors enabled_toolsets).
ALTER TABLE "users" ADD COLUMN "enabled_skills" TEXT[] NOT NULL DEFAULT '{}';
