import { prisma } from "@/lib/db";
import { ensureDatabaseReady } from "@/lib/database-bootstrap";
import { seedInitialTrainingDataIfNeeded } from "@/lib/initial-training-seed";
import { sanitizeLessonHtml } from "@/lib/sanitize-lesson-html";
import { canAccessTrainingModule, getAccessibleTrainingModuleIds } from "@/lib/training-access";
import { revalidateTag, unstable_cache } from "next/cache";

const trainingCatalogTag = "training-catalog";

function trainingLessonTag(id: number) {
  return `training-lesson-${id}`;
}

async function ensureTrainingDataReady() {
  await ensureDatabaseReady();
  await seedInitialTrainingDataIfNeeded(prisma);
}

function publicModule(item: { id: number; orderNum: number; title: string; description: string | null; icon: string | null; gradient: string | null; isActive: boolean; parentId: number | null }) {
  return {
    id: item.id,
    order_num: item.orderNum,
    title: item.title,
    description: item.description,
    icon: item.icon,
    gradient: item.gradient,
    is_active: item.isActive,
    parent_id: item.parentId,
  };
}

function publicLessonMetadata(item: { id: number; moduleId: number; orderNum: number; title: string; lessonType: { toLowerCase(): string }; durationMin: number }) {
  return {
    id: item.id,
    module_id: item.moduleId,
    order_num: item.orderNum,
    title: item.title,
    lesson_type: item.lessonType.toLowerCase(),
    duration_min: item.durationMin,
  };
}

function publicQuizMetadata(item: { id: number; moduleId: number; title: string | null; description: string | null; passScore: number; maxAttempts: number | null; _count: { questions: number } }) {
  return {
    id: item.id,
    module_id: item.moduleId,
    question_count: item._count.questions,
    rules: { title: item.title || undefined, description: item.description || undefined },
    pass_score: item.passScore,
    max_attempts: item.maxAttempts,
  };
}

async function readTrainingCatalog() {
  await ensureTrainingDataReady();

  const [modules, lessons, quizzes] = await Promise.all([
    prisma.module.findMany({ orderBy: [{ orderNum: "asc" }, { id: "asc" }] }),
    prisma.lesson.findMany({
      select: { id: true, moduleId: true, orderNum: true, title: true, lessonType: true, durationMin: true },
      orderBy: [{ orderNum: "asc" }, { id: "asc" }],
    }),
    prisma.quiz.findMany({
      select: { id: true, moduleId: true, title: true, description: true, passScore: true, maxAttempts: true, _count: { select: { questions: true } } },
      orderBy: { id: "asc" },
    }),
  ]);

  return {
    title: "База знаний",
    modules: modules.map(publicModule),
    lessons: lessons.map(publicLessonMetadata),
    quizzes: quizzes.map(publicQuizMetadata),
  };
}

const getCachedTrainingCatalog = unstable_cache(
  readTrainingCatalog,
  ["training-catalog-v6"],
  { tags: [trainingCatalogTag] },
);

export async function getTrainingCatalog(userId: string) {
  const [catalog, permitted] = await Promise.all([getCachedTrainingCatalog(), getAccessibleTrainingModuleIds(userId)]);
  const hideExpressModule = permitted.access.state === "FULL_ACCESS" && permitted.access.method === "MAIN_PROGRAM";
  return {
    ...catalog,
    access: {
      method: permitted.access.method,
      state: permitted.access.state,
      trial_module_id: permitted.access.trialModuleId,
      review_requested_at: permitted.access.reviewRequestedAt?.toISOString() || null,
      decision_comment: permitted.access.decisionComment || "",
    },
    modules: (hideExpressModule ? catalog.modules.filter((module) => permitted.ids.has(module.id)) : catalog.modules)
      .map((module) => ({ ...module, is_locked: !permitted.ids.has(module.id) })),
    lessons: catalog.lessons.filter((lesson) => permitted.ids.has(lesson.module_id)),
    quizzes: catalog.quizzes.filter((quiz) => permitted.ids.has(quiz.module_id)),
  };
}

export async function getPublicTrainingCatalog() {
  const catalog = await getCachedTrainingCatalog();
  const activeModuleIds = new Set(catalog.modules.filter((module) => module.is_active).map((module) => module.id));

  return {
    ...catalog,
    access: {
      method: "MAIN_PROGRAM" as const,
      state: "FULL_ACCESS" as const,
      trial_module_id: 23,
      review_requested_at: null,
      decision_comment: "",
    },
    modules: catalog.modules
      .filter((module) => module.is_active)
      .map((module) => ({ ...module, is_locked: false })),
    lessons: catalog.lessons.filter((lesson) => activeModuleIds.has(lesson.module_id)),
    quizzes: catalog.quizzes.filter((quiz) => activeModuleIds.has(quiz.module_id)),
  };
}

async function readTrainingLesson(id: number) {
  await ensureTrainingDataReady();
  const lesson = await prisma.lesson.findUnique({ where: { id } });
  if (!lesson) return null;
  return { ...publicLessonMetadata(lesson), content: sanitizeLessonHtml(lesson.content) };
}

export async function getTrainingLesson(id: number, userId: string) {
  const lesson = await unstable_cache(
    () => readTrainingLesson(id),
    ["training-lesson-v6", String(id)],
    { tags: [trainingCatalogTag, trainingLessonTag(id)] },
  )();
  if (!lesson || !await canAccessTrainingModule(userId, lesson.module_id)) return null;
  return lesson;
}

/** Call this from any content mutation, including future module administration routes. */
export function revalidateTrainingCatalog() {
  revalidateTag(trainingCatalogTag, "max");
}

export function revalidateTrainingLesson(id: number) {
  revalidateTrainingCatalog();
  revalidateTag(trainingLessonTag(id), "max");
}

export async function getTrainingQuiz(moduleId: number, userId: string) {
  if (!await canAccessTrainingModule(userId, moduleId)) return null;
  await ensureTrainingDataReady();
  const quiz = await prisma.quiz.findUnique({
    where: { moduleId },
    include: { questions: { include: { options: true }, orderBy: { position: "asc" } } },
  });
  if (!quiz) return null;
  return {
    id: quiz.id,
    module_id: quiz.moduleId,
    question_count: quiz.questions.length,
    questions: quiz.questions.map((question) => ({
      question: question.question,
      options: question.options.sort((a, b) => a.position - b.position).map((option) => option.text),
    })),
    rules: { title: quiz.title || undefined, description: quiz.description || undefined },
    pass_score: quiz.passScore,
    max_attempts: quiz.maxAttempts,
  };
}
