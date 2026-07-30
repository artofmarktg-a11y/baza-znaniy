import { NextResponse } from "next/server";
import { z } from "zod";
import { TrainingAccessState } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requestIdFor, writeAuditEvent } from "@/lib/audit";
import { requirePermission } from "@/lib/permissions";
import { trialModuleId } from "@/lib/training-access";

const schema = z.object({
  decision: z.enum(["grant", "complete", "return"]),
  comment: z.string().trim().max(1_000).optional().default(""),
});

const decisionState = {
  grant: TrainingAccessState.FULL_ACCESS,
  complete: TrainingAccessState.TRAINING_COMPLETED,
  return: TrainingAccessState.TRAINEE,
} as const;

const decisionNotification = {
  grant: "TRAINING_ACCESS_GRANTED",
  complete: "TRAINING_ACCESS_COMPLETED",
} as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("training_completion_manage");
  if ("error" in access) return access.error;
  const requestId = requestIdFor(request);
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректное решение по обучению." }, { status: 400 });

  const employee = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, managerId: true, username: true, trainingAccess: true },
  });
  if (!employee || employee.role !== "MANAGER") return NextResponse.json({ error: "Сотрудник не найден." }, { status: 404 });
  if (access.user.role !== "ADMIN" && employee.managerId !== access.user.id) {
    return NextResponse.json({ error: "Можно рассматривать только сотрудников своей команды." }, { status: 403 });
  }
  const existingTrainingAccess = employee.trainingAccess;
  if (existingTrainingAccess?.state !== TrainingAccessState.REVIEW_REQUIRED) {
    return NextResponse.json({ error: "Сотрудник ещё не ожидает решения по обучению." }, { status: 409 });
  }

  const now = new Date();
  const nextState = decisionState[parsed.data.decision];
  const updated = await prisma.$transaction(async (transaction) => {
    const trainingAccess = await transaction.userTrainingAccess.upsert({
      where: { userId: id },
      create: {
        userId: id,
        state: nextState,
        trialModuleId,
        reviewedAt: now,
        reviewedById: access.user.id,
        decisionComment: parsed.data.comment,
      },
      update: {
        state: nextState,
        reviewedAt: now,
        reviewedById: access.user.id,
        decisionComment: parsed.data.comment,
      },
    });

    await writeAuditEvent(transaction, {
      actorId: access.user.id,
      action: `training_access.${parsed.data.decision}`,
      entity: "UserTrainingAccess",
      entityId: id,
      requestId,
      before: { state: existingTrainingAccess.state, comment: existingTrainingAccess.decisionComment },
      after: { state: nextState, comment: parsed.data.comment },
    });

    if (parsed.data.decision !== "return") {
      await transaction.notification.upsert({
        where: { dedupeKey: `training-access:${parsed.data.decision}:${id}:${existingTrainingAccess.reviewRequestedAt?.toISOString() || "current"}` },
        create: {
          recipientId: id,
          actorId: access.user.id,
          moduleId: existingTrainingAccess.trialModuleId,
          kind: decisionNotification[parsed.data.decision],
          dedupeKey: `training-access:${parsed.data.decision}:${id}:${existingTrainingAccess.reviewRequestedAt?.toISOString() || "current"}`,
          metadata: { comment: parsed.data.comment },
        },
        update: { readAt: null },
      });
    }
    return trainingAccess;
  });

  const response = NextResponse.json({
    state: updated.state,
    reviewedAt: updated.reviewedAt?.toISOString() || null,
    decisionComment: updated.decisionComment,
  });
  response.headers.set("X-Request-Id", requestId);
  return response;
}
