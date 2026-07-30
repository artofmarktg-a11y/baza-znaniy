-- CreateEnum
CREATE TYPE "TrainingAccessState" AS ENUM ('TRAINEE', 'REVIEW_REQUIRED', 'FULL_ACCESS', 'TRAINING_COMPLETED');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'TRAINEE_REVIEW_REQUIRED';
ALTER TYPE "NotificationKind" ADD VALUE 'TRAINING_ACCESS_GRANTED';
ALTER TYPE "NotificationKind" ADD VALUE 'TRAINING_ACCESS_COMPLETED';

-- CreateTable
CREATE TABLE "UserTrainingAccess" (
    "userId" TEXT NOT NULL,
    "state" "TrainingAccessState" NOT NULL DEFAULT 'TRAINEE',
    "trialModuleId" INTEGER NOT NULL DEFAULT 23,
    "reviewRequestedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "decisionComment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTrainingAccess_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "UserTrainingAccess_state_reviewRequestedAt_idx" ON "UserTrainingAccess"("state", "reviewRequestedAt");

-- AddForeignKey
ALTER TABLE "UserTrainingAccess" ADD CONSTRAINT "UserTrainingAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing accounts retain their current full training programme.
INSERT INTO "UserTrainingAccess" ("userId", "state", "trialModuleId", "createdAt", "updatedAt")
SELECT "id", 'FULL_ACCESS', 23, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User";

-- The decision is a management permission, not a content-editing permission.
INSERT INTO "RolePermission" ("role", "permission", "allowed", "updatedAt")
VALUES
  ('ADMIN', 'training_admission_manage', true, CURRENT_TIMESTAMP),
  ('ROP', 'training_admission_manage', true, CURRENT_TIMESTAMP),
  ('KNOWLEDGE_EDITOR', 'training_admission_manage', false, CURRENT_TIMESTAMP),
  ('MANAGER', 'training_admission_manage', false, CURRENT_TIMESTAMP)
ON CONFLICT ("role", "permission") DO NOTHING;
