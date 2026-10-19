-- Issue #721: Tenant AI integration (BYO key or managed tier)
ALTER TABLE "Organizations"
  ADD COLUMN IF NOT EXISTS "aiMode" VARCHAR(20) DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS "aiProvider" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "aiApiKeyEncrypted" TEXT;
