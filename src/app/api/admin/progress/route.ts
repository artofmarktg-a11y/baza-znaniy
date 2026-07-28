import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function GET() {
  const access = await requirePermission("team_progress_view");
  if ("error" in access) return access.error;

  const teamFilter = access.user.role === "ADMIN"
    ? { role: "MANAGER" as const }
    : { managerId: access.user.id, role: "MANAGER" as const };
  const users = await prisma.user.findMany({
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
      createdAt: true,
      managerId: true,
      manager: { select: { lastName: true, firstName: true, middleName: true, username: true } },
      lessonProgress: { select: { lessonId: true } },
      quizAttempts: {
        orderBy: { completedAt: "asc" },
        select: { quizId: true, score: true, total: true, passed: true, answers: true, completedAt: true },
      },
    },
  });

  return NextResponse.json({
    users: users.map((user) => ({
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
      createdAt: user.createdAt.toISOString(),
      managerId: user.managerId || "",
      managerName: user.manager ? [user.manager.lastName, user.manager.firstName, user.manager.middleName].filter(Boolean).join(" ") || user.manager.username : "",
      completedLessons: user.lessonProgress.map((item) => item.lessonId),
      quizAttempts: user.quizAttempts.map((attempt) => ({
        moduleId: attempt.quizId,
        score: attempt.score,
        total: attempt.total,
        passed: attempt.passed,
        answers: attempt.answers,
        completedAt: attempt.completedAt.toISOString(),
      })),
    })),
  });
}
