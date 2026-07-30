import trainingData from "@/data/training-data.json";
import type { PrismaClient } from "@/generated/prisma/client";
import { improveModuleTwoLessonContent } from "@/lib/module-two-content";

type SourceModule = (typeof trainingData.modules)[number];
type SourceLesson = (typeof trainingData.lessons)[number];
type SourceQuiz = (typeof trainingData.quizzes)[number];

let seedPromise: Promise<void> | null = null;

function lessonType(value: SourceLesson["lesson_type"]) {
  if (value === "practice") return "PRACTICE" as const;
  if (value === "quiz") return "QUIZ" as const;
  return "THEORY" as const;
}

async function seedModules(prisma: PrismaClient, modules: SourceModule[]) {
  for (const trainingModule of modules) {
    await prisma.module.upsert({
      where: { id: trainingModule.id },
      create: {
        id: trainingModule.id,
        orderNum: trainingModule.order_num,
        title: trainingModule.title,
        description: trainingModule.description || "",
        icon: trainingModule.icon || "book-open",
        gradient: trainingModule.gradient || "135deg,#1e3a5f,#c93232",
        isActive: trainingModule.is_active,
      },
      update: {
        orderNum: trainingModule.order_num,
        title: trainingModule.title,
        description: trainingModule.description || "",
        icon: trainingModule.icon || "book-open",
        gradient: trainingModule.gradient || "135deg,#1e3a5f,#c93232",
        isActive: trainingModule.is_active,
      },
    });
  }

  for (const trainingModule of modules) {
    await prisma.module.update({
      where: { id: trainingModule.id },
      data: { parentId: trainingModule.parent_id },
    });
  }
}

async function seedLessons(prisma: PrismaClient, lessons: SourceLesson[]) {
  for (const lesson of lessons) {
    const content = improveModuleTwoLessonContent(lesson.id, lesson.content);
    await prisma.lesson.upsert({
      where: { id: lesson.id },
      create: {
        id: lesson.id,
        moduleId: lesson.module_id,
        orderNum: lesson.order_num,
        title: lesson.title,
        content,
        lessonType: lessonType(lesson.lesson_type),
        durationMin: lesson.duration_min,
      },
      update: {
        moduleId: lesson.module_id,
        orderNum: lesson.order_num,
        title: lesson.title,
        content,
        lessonType: lessonType(lesson.lesson_type),
        durationMin: lesson.duration_min,
      },
    });
  }
}

async function seedQuizzes(prisma: PrismaClient, quizzes: SourceQuiz[]) {
  for (const quiz of quizzes) {
    await prisma.quiz.upsert({
      where: { moduleId: quiz.module_id },
      create: {
        id: quiz.id,
        moduleId: quiz.module_id,
        title: quiz.rules?.title || "",
        description: quiz.rules?.description || "",
        passScore: quiz.pass_score,
        maxAttempts: quiz.max_attempts,
      },
      update: {
        title: quiz.rules?.title || "",
        description: quiz.rules?.description || "",
        passScore: quiz.pass_score,
        maxAttempts: quiz.max_attempts,
      },
    });

    await prisma.quizQuestion.deleteMany({ where: { quizId: quiz.id } });
    await prisma.quizQuestion.createMany({
      data: quiz.questions.map((question, index) => ({
        quizId: quiz.id,
        position: index,
        question: question.question,
        correctOptionIndex: Array.isArray(question.correct) ? question.correct[0] : question.correct,
      })),
    });

    const questions = await prisma.quizQuestion.findMany({
      where: { quizId: quiz.id },
      select: { id: true, position: true },
    });
    const questionIds = new Map(questions.map((question) => [question.position, question.id]));
    await prisma.quizOption.createMany({
      data: quiz.questions.flatMap((question, questionIndex) =>
        question.options.map((text, optionIndex) => ({
          questionId: questionIds.get(questionIndex)!,
          position: optionIndex,
          text,
        })),
      ),
    });
  }
}

async function seedPermissions(prisma: PrismaClient) {
  const permissionDefaults = {
    ADMIN: ["training", "knowledge_manage", "team_progress_view", "training_completion_manage", "employees_view", "employees_manage", "access_manage"],
    ROP: ["training", "team_progress_view", "training_completion_manage"],
    KNOWLEDGE_EDITOR: ["training", "knowledge_manage", "employees_view"],
    MANAGER: ["training"],
  } as const;
  const allPermissions: string[] = Array.from(new Set(Object.values(permissionDefaults).flat()));

  for (const [role, allowedPermissions] of Object.entries(permissionDefaults)) {
    const allowed = allowedPermissions as readonly string[];
    for (const permission of allPermissions) {
      await prisma.rolePermission.upsert({
        where: { role_permission: { role: role as keyof typeof permissionDefaults, permission } },
        create: { role: role as keyof typeof permissionDefaults, permission, allowed: allowed.includes(permission) },
        update: {},
      });
    }
  }
}

async function seedIfNeededOnce(prisma: PrismaClient) {
  const moduleCount = await prisma.module.count();
  if (moduleCount > 0) return;

  await seedModules(prisma, trainingData.modules);
  await seedLessons(prisma, trainingData.lessons);
  await seedQuizzes(prisma, trainingData.quizzes);
  await seedPermissions(prisma);
}

export async function seedInitialTrainingDataIfNeeded(prisma: PrismaClient) {
  seedPromise ||= seedIfNeededOnce(prisma);
  return seedPromise;
}
