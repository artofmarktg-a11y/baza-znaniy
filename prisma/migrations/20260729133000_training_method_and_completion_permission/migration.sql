-- CreateEnum
CREATE TYPE "TrainingMethod" AS ENUM ('EXPRESS_TRAINING', 'MAIN_PROGRAM');

-- AlterTable
ALTER TABLE "UserTrainingAccess" ADD COLUMN "method" "TrainingMethod" NOT NULL DEFAULT 'EXPRESS_TRAINING';

-- Rename the management permission without changing which roles have it.
UPDATE "RolePermission"
SET "permission" = 'training_completion_manage'
WHERE "permission" = 'training_admission_manage';
