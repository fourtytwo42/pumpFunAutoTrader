-- Ensure user avatar column exists for session metadata
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;


