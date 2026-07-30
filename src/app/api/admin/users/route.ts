import argon2 from "argon2";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { isRussianPhone, normalizeRussianPhone } from "@/lib/phone";
import { requestIdFor, writeAuditEvent } from "@/lib/audit";
import { trialModuleId } from "@/lib/training-access";

const roleSchema = z.enum(["ADMIN", "ROP", "KNOWLEDGE_EDITOR", "MANAGER"]);
const phoneSchema = z.string().trim().max(50).transform(normalizeRussianPhone).refine(isRussianPhone);
const userSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(80),
  password: z.string().min(12).max(256),
  lastName: z.string().trim().max(120).default(""),
  firstName: z.string().trim().max(120).default(""),
  middleName: z.string().trim().max(120).default(""),
  position: z.string().trim().max(160).default(""),
  phone: phoneSchema.default(""),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  role: roleSchema.default("MANAGER"),
  trainingMethod: z.enum(["EXPRESS_TRAINING", "MAIN_PROGRAM"]).default("EXPRESS_TRAINING"),
  managerId: z.string().trim().cuid().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  hireDate: z.string().date().optional().or(z.literal("")),
});

function publicUser(user: {
  id: string; username: string; lastName: string; firstName: string; middleName: string; position: string; phone: string; email: string | null;
  role: "ADMIN" | "ROP" | "KNOWLEDGE_EDITOR" | "MANAGER"; managerId: string | null; isActive: boolean; hireDate: Date | null; trainingDueDate: Date | null; lastReminderAt: Date | null; createdAt: Date;
  manager?: { username: string; lastName: string; firstName: string; middleName: string } | null;
  trainingAccess?: { method: "EXPRESS_TRAINING" | "MAIN_PROGRAM"; state: "TRAINEE" | "REVIEW_REQUIRED" | "FULL_ACCESS" | "TRAINING_COMPLETED"; trialModuleId: number; reviewRequestedAt: Date | null; reviewedAt: Date | null; decisionComment: string } | null;
}) {
  return {
    id: user.id,
    username: user.username,
    lastName: user.lastName,
    firstName: user.firstName,
    middleName: user.middleName,
    position: user.position,
    phone: user.phone,
    email: user.email,
    role: user.role,
    managerId: user.managerId || "",
    managerName: user.manager ? [user.manager.lastName, user.manager.firstName, user.manager.middleName].filter(Boolean).join(" ") || user.manager.username : "",
    isActive: user.isActive,
    hireDate: user.hireDate?.toISOString().slice(0, 10) || "",
    trainingDueDate: user.trainingDueDate?.toISOString().slice(0, 10) || "",
    lastReminderAt: user.lastReminderAt?.toISOString() || null,
    trainingAccess: user.trainingAccess ? {
      method: user.trainingAccess.method,
      state: user.trainingAccess.state,
      trialModuleId: user.trainingAccess.trialModuleId,
      reviewRequestedAt: user.trainingAccess.reviewRequestedAt?.toISOString() || null,
      reviewedAt: user.trainingAccess.reviewedAt?.toISOString() || null,
      decisionComment: user.trainingAccess.decisionComment,
    } : { method: "EXPRESS_TRAINING", state: "FULL_ACCESS", trialModuleId: 23, reviewRequestedAt: null, reviewedAt: null, decisionComment: "" },
    createdAt: user.createdAt.toISOString(),
  };
}

function userAuditSnapshot(user: {
  username: string; role: "ADMIN" | "ROP" | "KNOWLEDGE_EDITOR" | "MANAGER"; managerId: string | null; isActive: boolean;
  position: string; hireDate: Date | null;
}) {
  return {
    username: user.username,
    role: user.role,
    managerId: user.managerId,
    isActive: user.isActive,
    position: user.position,
    hireDate: user.hireDate?.toISOString().slice(0, 10) || null,
  };
}

async function validManagerId(managerId: string, userId?: string) {
  if (!managerId) return null;
  if (managerId === userId) return undefined;
  const manager = await prisma.user.findFirst({ where: { id: managerId, role: "ROP", isActive: true }, select: { id: true } });
  return manager?.id;
}

export async function GET() {
  const access = await requirePermission("employees_view");
  if ("error" in access) return access.error;
  const [users, totalLessons, totalQuizzes] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { username: "asc" }],
      include: {
        manager: { select: { username: true, lastName: true, firstName: true, middleName: true } },
        lessonProgress: { select: { completedAt: true } },
        quizAttempts: { select: { quizId: true, passed: true, completedAt: true } },
        trainingAccess: { select: { method: true, state: true, trialModuleId: true, reviewRequestedAt: true, reviewedAt: true, decisionComment: true } },
      },
    }),
    prisma.lesson.count(),
    prisma.quiz.count(),
  ]);
  const totalLearningItems = totalLessons + totalQuizzes;

  return NextResponse.json(users.map((user) => {
    const passedQuizzes = new Set(user.quizAttempts.filter((attempt) => attempt.passed).map((attempt) => attempt.quizId)).size;
    const activityDates = [
      ...user.lessonProgress.map((progress) => progress.completedAt),
      ...user.quizAttempts.map((attempt) => attempt.completedAt),
    ];
    const lastLearningActivityAt = activityDates.length
      ? new Date(Math.max(...activityDates.map((date) => date.getTime()))).toISOString()
      : null;
    return {
      ...publicUser(user),
      learningProgress: totalLearningItems ? Math.round(((user.lessonProgress.length + passedQuizzes) / totalLearningItems) * 100) : 0,
      lastLearningActivityAt,
    };
  }));
}

export async function POST(request: Request) {
  const access = await requirePermission("employees_manage");
  if ("error" in access) return access.error;
  const requestId = requestIdFor(request);
  const parsed = userSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Проверьте данные сотрудника и пароль (минимум 12 символов)." }, { status: 400 });

  try {
    const input = parsed.data;
    const managerId = input.role === "MANAGER" ? await validManagerId(input.managerId || "") : null;
    if (input.role === "MANAGER" && input.managerId && !managerId) return NextResponse.json({ error: "Руководителем может быть только активный руководитель." }, { status: 400 });
    if (input.role === "MANAGER" && !managerId) return NextResponse.json({ error: "Для менеджера выберите руководителя." }, { status: 400 });
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          username: input.username,
          passwordHash,
          lastName: input.lastName,
          firstName: input.firstName,
          middleName: input.middleName,
          position: input.position,
          phone: input.phone,
          email: input.email || null,
          role: input.role,
          managerId,
          isActive: input.isActive,
          hireDate: input.hireDate ? new Date(`${input.hireDate}T00:00:00.000Z`) : null,
          trainingAccess: {
            create: {
              method: input.trainingMethod,
              state: input.role === "MANAGER" && input.trainingMethod === "EXPRESS_TRAINING" ? "TRAINEE" : "FULL_ACCESS",
              trialModuleId,
            },
          },
        },
        include: { manager: { select: { username: true, lastName: true, firstName: true, middleName: true } } },
      });
      await writeAuditEvent(transaction, {
        actorId: access.user.id,
        action: "user.created",
        entity: "User",
        entityId: createdUser.id,
        requestId,
        after: userAuditSnapshot(createdUser),
      });
      return createdUser;
    });
    const response = NextResponse.json(publicUser(user), { status: 201 });
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "Сотрудник с таким логином или email уже существует." }, { status: 409 });
    }
    throw error;
  }
}
