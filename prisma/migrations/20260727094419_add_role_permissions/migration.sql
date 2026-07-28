-- CreateTable
CREATE TABLE "RolePermission" (
    "role" "Role" NOT NULL,
    "permission" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role","permission")
);

-- CreateIndex
CREATE INDEX "RolePermission_permission_allowed_idx" ON "RolePermission"("permission", "allowed");
