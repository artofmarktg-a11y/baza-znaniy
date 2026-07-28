import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function GET() {
  const access = await requirePermission("training");
  if ("error" in access) return access.error;
  const { user } = access;

  const [completedLessons, attempts] = await Promise.all([
    prisma.lessonProgress.findMany({ where: { userId: user.id }, select: { lessonId: true } }),
    prisma.quizAttempt.findMany({
      where: { userId: user.id },
      orderBy: { completedAt: "asc" },
      select: { quizId: true, score: true, total: true, passed: true, answers: true, completedAt: true },
    }),
  ]);

  return NextResponse.json({
    completedLessons: completedLessons.map((item) => item.lessonId),
    quizAttempts: attempts.map((attempt) => ({
      moduleId: attempt.quizId,
      score: attempt.score,
      total: attempt.total,
      passed: attempt.passed,
      answers: attempt.answers,
      completedAt: attempt.completedAt.toISOString(),
    })),
  });
}
