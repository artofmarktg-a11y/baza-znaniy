import { prisma } from "@/lib/db";
import { ensureDatabaseReady } from "@/lib/database-bootstrap";
import { seedInitialTrainingDataIfNeeded } from "@/lib/initial-training-seed";
import { sanitizeLessonHtml } from "@/lib/sanitize-lesson-html";

export async function getTrainingData() {
  await ensureDatabaseReady();
  await seedInitialTrainingDataIfNeeded(prisma);

  const [modules, lessons, quizzes] = await Promise.all([
    prisma.module.findMany({ orderBy: [{ orderNum: "asc" }, { id: "asc" }] }),
    prisma.lesson.findMany({ orderBy: [{ orderNum: "asc" }, { id: "asc" }] }),
    prisma.quiz.findMany({
      include: { questions: { include: { options: true }, orderBy: { position: "asc" } } },
      orderBy: { id: "asc" },
    }),
  ]);

  return {
    title: "База знаний",
    modules: modules.map((item) => ({
      id: item.id,
      order_num: item.orderNum,
      title: item.title,
      description: item.description,
      icon: item.icon,
      gradient: item.gradient,
      is_active: item.isActive,
      parent_id: item.parentId,
    })),
    lessons: lessons.map((item) => ({
      id: item.id,
      module_id: item.moduleId,
      order_num: item.orderNum,
      title: item.title,
      content: sanitizeLessonHtml(item.content),
      lesson_type: item.lessonType.toLowerCase(),
      duration_min: item.durationMin,
    })),
    quizzes: quizzes.map((item) => ({
      id: item.id,
      module_id: item.moduleId,
      questions: item.questions.map((question) => ({
        question: question.question,
        options: question.options.sort((a, b) => a.position - b.position).map((option) => option.text),
      })),
      rules: { title: item.title, description: item.description },
      pass_score: item.passScore,
      max_attempts: item.maxAttempts,
    })),
  };
}
