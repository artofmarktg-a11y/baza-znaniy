ALTER TABLE "User"
  ADD COLUMN "avatarData" TEXT,
  ADD COLUMN "avatarMimeType" TEXT,
  ADD COLUMN "hasAvatar" BOOLEAN NOT NULL DEFAULT false;
