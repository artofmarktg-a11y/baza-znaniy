import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { requestIdFor, writeAuditEvent } from "@/lib/audit";

const dueDateSchema = z.object({
  dueDate: z.string().date().nullable().or(z.literal("")),
});

function teamMemberWhere(user: { id: string; role: "ADMIN" | "ROP" | "KNOWLEDGE_EDITOR" | "MANAGER" }, id: string) {
  return user.role === "ADMIN"
    ? { id, role: "MANAGER" as const }
    : { id, role: "MANAGER" as const, managerId: user.id };
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("team_progress_view");
  if ("error" in access) return access.error;
  const requestId = requestIdFor(request);
  const { id } = await params;
  const parsed = dueDateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Укажите корректный срок обучения." }, { status: 400 });

  const target = await prisma.user.findFirst({ where: teamMemberWhere(access.user, id), select: { id: true, trainingDueDate: true } });
  if (!target) return NextResponse.json({ error: "Сотрудник не найден в вашей команде." }, { status: 404 });

  const trainingDueDate = parsed.data.dueDate ? new Date(`${parsed.data.dueDate}T00:00:00.000Z`) : null;
  const updated = await prisma.$transaction(async (transaction) => {
    const updatedUser = await transaction.user.update({ where: { id: target.id }, data: { trainingDueDate }, select: { trainingDueDate: true, lastReminderAt: true } });
    await writeAuditEvent(transaction, {
      actorId: access.user.id,
      action: "training.deadline.updated",
      entity: "User",
      entityId: target.id,
      requestId,
      before: { trainingDueDate: target.trainingDueDate?.toISOString().slice(0, 10) || null },
      after: { trainingDueDate: updatedUser.trainingDueDate?.toISOString().slice(0, 10) || null },
    });
    return updatedUser;
  });
  const response = NextResponse.json({
    trainingDueDate: updated.trainingDueDate?.toISOString().slice(0, 10) || "",
    lastReminderAt: updated.lastReminderAt?.toISOString() || null,
  });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("team_progress_view");
  if ("error" in access) return access.error;
  const requestId = requestIdFor(_request);
  const { id } = await params;
  const target = await prisma.user.findFirst({
    where: teamMemberWhere(access.user, id),
    select: { id: true, trainingDueDate: true },
  });
  if (!target) return NextResponse.json({ error: "Сотрудник не найден в вашей команде." }, { status: 404 });

  const dueDateText = target.trainingDueDate ? ` Срок обучения — ${dateLabel(target.trainingDueDate)}.` : "";
  const message = `Пожалуйста, продолжите обучение в Базе знаний.${dueDateText}`;
  const dedupeKey = `training-reminder:${target.id}:${new Date().toISOString().slice(0, 10)}`;
  const now = new Date();
  await prisma.$transaction([
    prisma.notification.upsert({
      where: { dedupeKey },
      create: {
        recipientId: target.id,
        actorId: access.user.id,
        kind: "TRAINING_REMINDER",
        dedupeKey,
        metadata: { message },
      },
      update: { actorId: access.user.id, metadata: { message }, readAt: null, createdAt: now },
    }),
    prisma.user.update({ where: { id: target.id }, data: { lastReminderAt: now } }),
    prisma.auditEvent.create({
      data: {
        actorId: access.user.id,
        action: "training.reminder.sent",
        entity: "User",
        entityId: target.id,
        metadata: { requestId, after: { trainingDueDate: target.trainingDueDate?.toISOString().slice(0, 10) || null, sentAt: now.toISOString() } },
      },
    }),
  ]);

  const response = NextResponse.json({ ok: true, lastReminderAt: now.toISOString() });
  response.headers.set("X-Request-Id", requestId);
  return response;
}
