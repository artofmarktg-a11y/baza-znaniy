-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'TRAINING_REMINDER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "trainingDueDate" TIMESTAMP(3);
