-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'TRAINING_ASSIGNMENT';

-- CreateTable
CREATE TABLE "TrainingAssignment" (
    "id" TEXT NOT NULL,
    "moduleId" INTEGER NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedById" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingAssignment_employeeId_dueDate_idx" ON "TrainingAssignment"("employeeId", "dueDate");

-- CreateIndex
CREATE INDEX "TrainingAssignment_moduleId_dueDate_idx" ON "TrainingAssignment"("moduleId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAssignment_moduleId_employeeId_key" ON "TrainingAssignment"("moduleId", "employeeId");

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
