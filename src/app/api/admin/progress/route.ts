import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function GET() {
  const access = await requirePermission("team_progress_view");
  if ("error" in access) return access.error;

  const teamFilter = access.user.role === "ADMIN"
    ? { role: "MANAGER" as const }
    : { managerId: access.user.id, role: "MANAGER" as const };
  const [users, totalLessons, totalQuizzes] = await Promise.all([prisma.user.findMany({
    where: teamFilter,
    orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { username: "asc" }],
    select: {
      id: true,
      username: true,
      lastName: true,
      firstName: true,
      middleName: true,
      position: true,
      phone: true,
      email: true,
      role: true,
      isActive: true,
      hireDate: true,
      trainingDueDate: true,
      lastReminderAt: true,
      createdAt: true,
      managerId: true,
      manager: { select: { lastName: true, firstName: true, middleName: true, username: true } },
      trainingAccess: { select: { method: true, state: true, trialModuleId: true, reviewRequestedAt: true, reviewedAt: true, decisionComment: true } },
      lessonProgress: { select: { lessonId: true, completedAt: true } },
      quizAttempts: {
        orderBy: { completedAt: "asc" },
        select: { quizId: true, score: true, total: true, passed: true, answers: true, completedAt: true },
      },
    },
  }), prisma.lesson.count(), prisma.quiz.count()]);
  const totalLearningItems = totalLessons + totalQuizzes;

  return NextResponse.json({
    users: users.map((user) => {
      const passedQuizzes = new Set(user.quizAttempts.filter((attempt) => attempt.passed).map((attempt) => attempt.quizId)).size;
      const activityDates = [
        ...user.lessonProgress.map((progress) => progress.completedAt),
        ...user.quizAttempts.map((attempt) => attempt.completedAt),
      ];
      const lastLearningActivityAt = activityDates.length
        ? new Date(Math.max(...activityDates.map((date) => date.getTime()))).toISOString()
        : null;
      return {
        userId: user.id,
        username: user.username,
        lastName: user.lastName,
        firstName: user.firstName,
        middleName: user.middleName,
        position: user.position,
        phone: user.phone,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        hireDate: user.hireDate?.toISOString().slice(0, 10) || "",
        trainingDueDate: user.trainingDueDate?.toISOString().slice(0, 10) || "",
        lastReminderAt: user.lastReminderAt?.toISOString() || null,
        createdAt: user.createdAt.toISOString(),
        managerId: user.managerId || "",
        managerName: user.manager ? [user.manager.lastName, user.manager.firstName, user.manager.middleName].filter(Boolean).join(" ") || user.manager.username : "",
        trainingAccess: user.trainingAccess ? {
          method: user.trainingAccess.method,
          state: user.trainingAccess.state,
          trialModuleId: user.trainingAccess.trialModuleId,
          reviewRequestedAt: user.trainingAccess.reviewRequestedAt?.toISOString() || null,
          reviewedAt: user.trainingAccess.reviewedAt?.toISOString() || null,
          decisionComment: user.trainingAccess.decisionComment,
        } : { method: "EXPRESS_TRAINING", state: "FULL_ACCESS", trialModuleId: 23, reviewRequestedAt: null, reviewedAt: null, decisionComment: "" },
        learningProgress: totalLearningItems ? Math.round(((user.lessonProgress.length + passedQuizzes) / totalLearningItems) * 100) : 0,
        lastLearningActivityAt,
        completedLessons: user.lessonProgress.map((item) => item.lessonId),
        quizAttempts: user.quizAttempts.map((attempt) => ({
          moduleId: attempt.quizId,
          score: attempt.score,
          total: attempt.total,
          passed: attempt.passed,
          answers: attempt.answers,
          completedAt: attempt.completedAt.toISOString(),
        })),
      };
    }),
  });
}
