-- CreateTable
CREATE TABLE "LoginRateLimit" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginRateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "LoginRateLimit_updatedAt_idx" ON "LoginRateLimit"("updatedAt");
