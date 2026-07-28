-- Replace legacy permissions inherited from the previous application.
DELETE FROM "RolePermission";

INSERT INTO "RolePermission" ("role", "permission", "allowed", "updatedAt") VALUES
  ('ADMIN', 'training', true, CURRENT_TIMESTAMP),
  ('ADMIN', 'knowledge_manage', true, CURRENT_TIMESTAMP),
  ('ADMIN', 'team_progress_view', true, CURRENT_TIMESTAMP),
  ('ADMIN', 'employees_view', true, CURRENT_TIMESTAMP),
  ('ADMIN', 'employees_manage', true, CURRENT_TIMESTAMP),
  ('ADMIN', 'access_manage', true, CURRENT_TIMESTAMP),
  ('ROP', 'training', true, CURRENT_TIMESTAMP),
  ('ROP', 'knowledge_manage', false, CURRENT_TIMESTAMP),
  ('ROP', 'team_progress_view', true, CURRENT_TIMESTAMP),
  ('ROP', 'employees_view', false, CURRENT_TIMESTAMP),
  ('ROP', 'employees_manage', false, CURRENT_TIMESTAMP),
  ('ROP', 'access_manage', false, CURRENT_TIMESTAMP),
  ('KNOWLEDGE_EDITOR', 'training', true, CURRENT_TIMESTAMP),
  ('KNOWLEDGE_EDITOR', 'knowledge_manage', true, CURRENT_TIMESTAMP),
  ('KNOWLEDGE_EDITOR', 'team_progress_view', false, CURRENT_TIMESTAMP),
  ('KNOWLEDGE_EDITOR', 'employees_view', true, CURRENT_TIMESTAMP),
  ('KNOWLEDGE_EDITOR', 'employees_manage', false, CURRENT_TIMESTAMP),
  ('KNOWLEDGE_EDITOR', 'access_manage', false, CURRENT_TIMESTAMP),
  ('MANAGER', 'training', true, CURRENT_TIMESTAMP),
  ('MANAGER', 'knowledge_manage', false, CURRENT_TIMESTAMP),
  ('MANAGER', 'team_progress_view', false, CURRENT_TIMESTAMP),
  ('MANAGER', 'employees_view', false, CURRENT_TIMESTAMP),
  ('MANAGER', 'employees_manage', false, CURRENT_TIMESTAMP),
  ('MANAGER', 'access_manage', false, CURRENT_TIMESTAMP);

ALTER TABLE "User" ADD COLUMN "managerId" TEXT;
CREATE INDEX "User_managerId_isActive_idx" ON "User"("managerId", "isActive");
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "NotificationKind" AS ENUM ('MODULE_COMPLETED');

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "moduleId" INTEGER,
  "kind" "NotificationKind" NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "metadata" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;
