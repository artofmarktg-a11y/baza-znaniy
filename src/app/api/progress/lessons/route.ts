import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { notifyManagerAboutCompletedModule } from "@/lib/notifications";
import { requirePermission } from "@/lib/permissions";
import { canAccessTrainingModule, requestTraineeReviewIfReady } from "@/lib/training-access";

const schema = z.object({ lessonId: z.number().int().positive() });

export async function POST(request: Request) {
  const access = await requirePermission("training");
  if ("error" in access) return access.error;
  const { user } = access;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректный урок." }, { status: 400 });

  const lesson = await prisma.lesson.findUnique({ where: { id: parsed.data.lessonId }, select: { id: true, moduleId: true } });
  if (!lesson) return NextResponse.json({ error: "Урок не найден." }, { status: 404 });
  if (!await canAccessTrainingModule(user.id, lesson.moduleId)) {
    return NextResponse.json({ error: "Этот модуль пока недоступен. Дождитесь решения руководителя." }, { status: 403 });
  }

  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
    create: { userId: user.id, lessonId: lesson.id },
    update: {},
  });
  await notifyManagerAboutCompletedModule(user.id, lesson.moduleId);
  const reviewRequested = await requestTraineeReviewIfReady(user.id);

  return NextResponse.json({ ok: true, reviewRequested });
}
