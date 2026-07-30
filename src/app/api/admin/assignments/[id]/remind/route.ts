import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { requestIdFor } from "@/lib/audit";

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("team_progress_view");
  if ("error" in access) return access.error;
  const requestId = requestIdFor(_request);
  const { id } = await params;
  const assignment = await prisma.trainingAssignment.findFirst({
    where: {
      id,
      employee: access.user.role === "ADMIN"
        ? { role: "MANAGER" }
        : { role: "MANAGER", managerId: access.user.id },
    },
    include: { module: { select: { title: true } }, employee: { select: { id: true } } },
  });
  if (!assignment) return NextResponse.json({ error: "Назначение не найдено в вашей команде." }, { status: 404 });

  const message = `Напоминание: завершите модуль «${assignment.module.title}» до ${dateLabel(assignment.dueDate)}.${assignment.isRequired ? " Это обязательное назначение." : ""}`;
  const now = new Date();
  const dedupeKey = `training-assignment-reminder:${assignment.id}:${now.toISOString().slice(0, 10)}`;
  await prisma.$transaction([
    prisma.notification.upsert({
      where: { dedupeKey },
      create: { recipientId: assignment.employee.id, actorId: access.user.id, kind: "TRAINING_ASSIGNMENT", dedupeKey, metadata: { message, moduleTitle: assignment.module.title } },
      update: { actorId: access.user.id, readAt: null, createdAt: now, metadata: { message, moduleTitle: assignment.module.title } },
    }),
    prisma.trainingAssignment.update({ where: { id: assignment.id }, data: { lastReminderAt: now } }),
    prisma.auditEvent.create({
      data: {
        actorId: access.user.id,
        action: "training.assignment.reminder.sent",
        entity: "TrainingAssignment",
        entityId: assignment.id,
        metadata: { requestId, after: { sentAt: now.toISOString(), dueDate: assignment.dueDate.toISOString().slice(0, 10) } },
      },
    }),
  ]);
  const response = NextResponse.json({ ok: true, lastReminderAt: now.toISOString() });
  response.headers.set("X-Request-Id", requestId);
  return response;
}
