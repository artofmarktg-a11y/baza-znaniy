import { TrainingAccessState, TrainingMethod } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/** The two-day assessment programme is intentionally configured in one place. */
export const trialModuleId = 23;

export type TrainingAccessSnapshot = {
  method: TrainingMethod;
  state: TrainingAccessState;
  trialModuleId: number;
  reviewRequestedAt: Date | null;
  reviewedAt: Date | null;
  decisionComment: string;
};

export async function getTrainingAccess(userId: string): Promise<TrainingAccessSnapshot> {
  const access = await prisma.userTrainingAccess.findUnique({
    where: { userId },
    select: { method: true, state: true, trialModuleId: true, reviewRequestedAt: true, reviewedAt: true, decisionComment: true },
  });

  // This fallback keeps existing accounts readable until the deployment migration is applied.
  return access || {
    method: TrainingMethod.EXPRESS_TRAINING,
    state: TrainingAccessState.FULL_ACCESS,
    trialModuleId,
    reviewRequestedAt: null,
    reviewedAt: null,
    decisionComment: "",
  };
}

export async function getAccessibleTrainingModuleIds(userId: string) {
  const access = await getTrainingAccess(userId);
  const modules = await prisma.module.findMany({ select: { id: true, parentId: true } });
  const byId = new Map(modules.map((module) => [module.id, module]));
  const rootId = (item: { id: number; parentId: number | null }) => {
    let current = item;
    while (current.parentId !== null) {
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current.id;
  };

  if (access.state === TrainingAccessState.FULL_ACCESS) {
    const ids = new Set(modules.map((item) => item.id));
    if (access.method === TrainingMethod.MAIN_PROGRAM) {
      modules.filter((item) => rootId(item) === access.trialModuleId).forEach((item) => ids.delete(item.id));
    }
    return { access, ids };
  }

  const ids = new Set<number>();
  for (const item of modules) {
    if (rootId(item) === access.trialModuleId) ids.add(item.id);
  }
  return { access, ids };
}

export async function canAccessTrainingModule(userId: string, moduleId: number) {
  const { ids } = await getAccessibleTrainingModuleIds(userId);
  return ids.has(moduleId);
}

async function notifyReviewers(userId: string, moduleId: number) {
  const employee = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, managerId: true, username: true, lastName: true, firstName: true },
  });
  if (!employee) return;

  const recipients = employee.managerId
    ? [employee.managerId]
    : (await prisma.user.findMany({ where: { isActive: true, role: { in: ["ADMIN", "ROP"] } }, select: { id: true } })).map((user) => user.id);
  const employeeName = [employee.lastName, employee.firstName].filter(Boolean).join(" ") || employee.username;

  await Promise.all(recipients.map((recipientId) => prisma.notification.upsert({
    where: { dedupeKey: `trainee-review:${recipientId}:${userId}:${moduleId}` },
    create: {
      recipientId,
      actorId: userId,
      moduleId,
      kind: "TRAINEE_REVIEW_REQUIRED",
      dedupeKey: `trainee-review:${recipientId}:${userId}:${moduleId}`,
      metadata: { employeeName, trialModuleId: moduleId },
    },
    update: { readAt: null },
  })));
}

/** Moves a trainee to the human review queue only after every required item is complete. */
export async function requestTraineeReviewIfReady(userId: string) {
  const access = await getTrainingAccess(userId);
  if (access.state !== TrainingAccessState.TRAINEE) return false;

  const { ids } = await getAccessibleTrainingModuleIds(userId);
  const [lessons, quizzes] = await Promise.all([
    prisma.lesson.findMany({ where: { moduleId: { in: [...ids] } }, select: { id: true } }),
    prisma.quiz.findMany({ where: { moduleId: { in: [...ids] } }, select: { id: true } }),
  ]);
  if (!lessons.length) return false;

  const [completedLessons, passedAttempts] = await Promise.all([
    prisma.lessonProgress.count({ where: { userId, lessonId: { in: lessons.map((lesson) => lesson.id) } } }),
    quizzes.length ? prisma.quizAttempt.findMany({ where: { userId, quizId: { in: quizzes.map((quiz) => quiz.id) }, passed: true }, select: { quizId: true } }) : [],
  ]);
  const passedQuizIds = new Set(passedAttempts.map((attempt) => attempt.quizId));
  if (completedLessons !== lessons.length || quizzes.some((quiz) => !passedQuizIds.has(quiz.id))) return false;

  const updated = await prisma.userTrainingAccess.updateMany({
    where: { userId, state: TrainingAccessState.TRAINEE },
    data: { state: TrainingAccessState.REVIEW_REQUIRED, reviewRequestedAt: new Date(), reviewedAt: null, decisionComment: "" },
  });
  if (!updated.count) return false;
  await notifyReviewers(userId, access.trialModuleId);
  return true;
}
