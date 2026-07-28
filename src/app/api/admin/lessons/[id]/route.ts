import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { sanitizeLessonHtml } from "@/lib/sanitize-lesson-html";

const schema = z.object({
  title: z.string().trim().min(1).max(240),
  content: z.string().max(500_000),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("knowledge_manage");
  if ("error" in access) return access.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Проверьте заголовок и содержание урока." }, { status: 400 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Урок не найден." }, { status: 404 });

  const lesson = await prisma.lesson.update({
    where: { id },
    data: { title: parsed.data.title, content: sanitizeLessonHtml(parsed.data.content) },
    select: { id: true, title: true, content: true },
  }).catch(() => null);
  if (!lesson) return NextResponse.json({ error: "Урок не найден." }, { status: 404 });
  return NextResponse.json(lesson);
}
