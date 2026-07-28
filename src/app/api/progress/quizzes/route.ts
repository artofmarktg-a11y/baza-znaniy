import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { notifyManagerAboutCompletedModule } from "@/lib/notifications";
import { requirePermission } from "@/lib/permissions";

const schema = z.object({
  quizId: z.number().int().positive(),
  answers: z.array(z.number().int().min(0).max(20)).min(1).max(100),
});

export async function POST(request: Request) {
  const access = await requirePermission("training");
  if ("error" in access) return access.error;
  const { user } = access;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные ответы." }, { status: 400 });

  const quiz = await prisma.quiz.findUnique({
    where: { id: parsed.data.quizId },
    include: { questions: { include: { options: true }, orderBy: { position: "asc" } } },
  });
  if (!quiz) return NextResponse.json({ error: "Тест не найден." }, { status: 404 });
  if (parsed.data.answers.length !== quiz.questions.length) {
    return NextResponse.json({ error: "Нужно ответить на каждый вопрос." }, { status: 400 });
  }
  if (quiz.questions.some((question, index) => parsed.data.answers[index] >= question.options.length)) {
    return NextResponse.json({ error: "Выбран недопустимый вариант ответа." }, { status: 400 });
  }

  const previousAttempts = await prisma.quizAttempt.findMany({
    where: { userId: user.id, quizId: quiz.id },
    select: { passed: true },
  });
  if (previousAttempts.some((attempt) => attempt.passed)) {
    return NextResponse.json({ error: "Тест уже сдан." }, { status: 409 });
  }
  if (quiz.maxAttempts && previousAttempts.length >= quiz.maxAttempts) {
    return NextResponse.json({ error: "Лимит попыток исчерпан." }, { status: 409 });
  }

  const score = quiz.questions.reduce(
    (total, question, index) => total + Number(question.correctOptionIndex === parsed.data.answers[index]),
    0,
  );
  const attempt = await prisma.quizAttempt.create({
    data: {
      userId: user.id,
      quizId: quiz.id,
      answers: parsed.data.answers,
      score,
      total: quiz.questions.length,
      passed: score >= quiz.passScore,
    },
  });

  if (attempt.passed) await notifyManagerAboutCompletedModule(user.id, quiz.moduleId);

  return NextResponse.json({
    score: attempt.score,
    total: attempt.total,
    passed: attempt.passed,
    answers: parsed.data.answers,
    completedAt: attempt.completedAt.toISOString(),
  });
}
