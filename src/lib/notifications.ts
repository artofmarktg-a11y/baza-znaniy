import { prisma } from "@/lib/db";

/** Creates one notification when a direct report has fully completed a module. */
export async function notifyManagerAboutCompletedModule(userId: string, moduleId: number) {
  const [module, employee] = await Promise.all([
    prisma.module.findUnique({
      where: { id: moduleId },
      select: { id: true, title: true, lessons: { select: { id: true } }, quiz: { select: { id: true } } },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, managerId: true },
    }),
  ]);

  if (!module || !employee?.managerId || !module.lessons.length) return;

  const [completedLessons, passedQuiz] = await Promise.all([
    prisma.lessonProgress.count({ where: { userId, lesson: { moduleId } } }),
    module.quiz ? prisma.quizAttempt.findFirst({ where: { userId, quizId: module.quiz.id, passed: true }, select: { id: true } }) : null,
  ]);

  const moduleComplete = completedLessons === module.lessons.length && (!module.quiz || Boolean(passedQuiz));
  if (!moduleComplete) return;

  await prisma.notification.upsert({
    where: { dedupeKey: `module-completed:${employee.managerId}:${userId}:${module.id}` },
    create: {
      recipientId: employee.managerId,
      actorId: userId,
      moduleId: module.id,
      kind: "MODULE_COMPLETED",
      dedupeKey: `module-completed:${employee.managerId}:${userId}:${module.id}`,
      metadata: { moduleTitle: module.title },
    },
    update: {},
  });
}
