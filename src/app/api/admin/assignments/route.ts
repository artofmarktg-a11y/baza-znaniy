import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { requestIdFor } from "@/lib/audit";

const assignmentSchema = z.object({
  moduleId: z.number().int().positive(),
  employeeIds: z.array(z.string().cuid()).min(1).max(500),
  dueDate: z.string().date(),
  isRequired: z.boolean(),
});

function teamMemberWhere(user: { id: string; role: "ADMIN" | "ROP" | "KNOWLEDGE_EDITOR" | "MANAGER" }, ids?: string[]) {
  return user.role === "ADMIN"
    ? { role: "MANAGER" as const, ...(ids ? { id: { in: ids } } : {}) }
    : { role: "MANAGER" as const, managerId: user.id, ...(ids ? { id: { in: ids } } : {}) };
}

function assignmentPayload(assignment: {
  id: string; moduleId: number; employeeId: string; dueDate: Date; isRequired: boolean; lastReminderAt: Date | null; createdAt: Date;
  employee: { username: string; lastName: string; firstName: string; middleName: string };
}) {
  return {
    id: assignment.id,
    moduleId: assignment.moduleId,
    employeeId: assignment.employeeId,
    dueDate: assignment.dueDate.toISOString().slice(0, 10),
    isRequired: assignment.isRequired,
    lastReminderAt: assignment.lastReminderAt?.toISOString() || null,
    createdAt: assignment.createdAt.toISOString(),
    employeeName: [assignment.employee.lastName, assignment.employee.firstName, assignment.employee.middleName].filter(Boolean).join(" ") || assignment.employee.username,
  };
}

export async function GET() {
  const access = await requirePermission("team_progress_view");
  if ("error" in access) return access.error;
  const assignments = await prisma.trainingAssignment.findMany({
    where: { employee: teamMemberWhere(access.user) },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: { employee: { select: { username: true, lastName: true, firstName: true, middleName: true } } },
  });
  return NextResponse.json({ assignments: assignments.map(assignmentPayload) });
}

export async function POST(request: Request) {
  const access = await requirePermission("team_progress_view");
  if ("error" in access) return access.error;
  const requestId = requestIdFor(request);
  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Проверьте модуль, сотрудников и срок назначения." }, { status: 400 });

  const trainingModule = await prisma.module.findFirst({ where: { id: parsed.data.moduleId, isActive: true }, select: { id: true } });
  if (!trainingModule) return NextResponse.json({ error: "Модуль не найден или недоступен." }, { status: 404 });
  const uniqueEmployeeIds = [...new Set(parsed.data.employeeIds)];
  const employees = await prisma.user.findMany({ where: teamMemberWhere(access.user, uniqueEmployeeIds), select: { id: true } });
  if (employees.length !== uniqueEmployeeIds.length) return NextResponse.json({ error: "Одного или нескольких сотрудников нет в вашей команде." }, { status: 403 });

  const dueDate = new Date(`${parsed.data.dueDate}T00:00:00.000Z`);
  const previousAssignments = await prisma.trainingAssignment.findMany({
    where: { moduleId: trainingModule.id, employeeId: { in: uniqueEmployeeIds } },
    select: { id: true, employeeId: true, dueDate: true, isRequired: true },
  });
  const previousByEmployeeId = new Map(previousAssignments.map((assignment) => [assignment.employeeId, assignment]));
  const assignments = await prisma.$transaction(async (transaction) => {
    const savedAssignments = await Promise.all(uniqueEmployeeIds.map((employeeId) => transaction.trainingAssignment.upsert({
      where: { moduleId_employeeId: { moduleId: trainingModule.id, employeeId } },
      create: { moduleId: trainingModule.id, employeeId, assignedById: access.user.id, dueDate, isRequired: parsed.data.isRequired },
      update: { assignedById: access.user.id, dueDate, isRequired: parsed.data.isRequired },
      include: { employee: { select: { username: true, lastName: true, firstName: true, middleName: true } } },
    })));
    await transaction.auditEvent.createMany({
      data: savedAssignments.map((assignment) => {
        const previous = previousByEmployeeId.get(assignment.employeeId);
        return {
          actorId: access.user.id,
          action: previous ? "training.assignment.updated" : "training.assignment.created",
          entity: "TrainingAssignment",
          entityId: assignment.id,
          metadata: {
            requestId,
            ...(previous ? { before: { dueDate: previous.dueDate.toISOString().slice(0, 10), isRequired: previous.isRequired } } : {}),
            after: { moduleId: assignment.moduleId, employeeId: assignment.employeeId, dueDate: assignment.dueDate.toISOString().slice(0, 10), isRequired: assignment.isRequired },
          },
        };
      }),
    });
    return savedAssignments;
  });
  const response = NextResponse.json({ assignments: assignments.map(assignmentPayload) }, { status: 201 });
  response.headers.set("X-Request-Id", requestId);
  return response;
}
