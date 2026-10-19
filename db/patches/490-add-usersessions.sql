CREATE TABLE IF NOT EXISTS "UserSessions" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jti UUID UNIQUE NOT NULL,
    "userId" UUID NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
    "organizationId" VARCHAR(255) NOT NULL,
    type VARCHAR(10) NOT NULL DEFAULT 'access' CHECK (type IN ('access', 'refresh')),
    "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "revokedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usersessions_jti ON "UserSessions"(jti);
CREATE INDEX IF NOT EXISTS idx_usersessions_userid ON "UserSessions"("userId", "revokedAt");
