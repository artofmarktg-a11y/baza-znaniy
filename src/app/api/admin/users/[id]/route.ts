import argon2 from "argon2";
import { NextResponse } from "next/server";
import { z } from "zod";
import { expiredSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { isRussianPhone, normalizeRussianPhone } from "@/lib/phone";
import { requestIdFor, writeAuditEvent } from "@/lib/audit";

const roleSchema = z.enum(["ADMIN", "ROP", "KNOWLEDGE_EDITOR", "MANAGER"]);
const phoneSchema = z.string().trim().max(50).transform(normalizeRussianPhone).refine(isRussianPhone);
const updateSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(80),
  password: z.string().max(256).optional(),
  lastName: z.string().trim().max(120), firstName: z.string().trim().max(120), middleName: z.string().trim().max(120),
  position: z.string().trim().max(160), phone: phoneSchema, email: z.string().trim().email().max(254).optional().or(z.literal("")),
  role: roleSchema, managerId: z.string().trim().cuid().optional().or(z.literal("")), isActive: z.boolean(), hireDate: z.string().date().optional().or(z.literal("")),
  trainingMethod: z.enum(["EXPRESS_TRAINING", "MAIN_PROGRAM"]).optional(),
});

async function canRemoveLastAdmin(id: string, role: string, isActive: boolean) {
  if (role !== "ADMIN" || isActive) return false;
  return (await prisma.user.count({ where: { role: "ADMIN", isActive: true } })) <= 1;
}

async function validManagerId(managerId: string, userId: string) {
  if (!managerId) return null;
  if (managerId === userId) return undefined;
  const manager = await prisma.user.findFirst({ where: { id: managerId, role: "ROP", isActive: true }, select: { id: true } });
  return manager?.id;
}

async function hasDirectReports(id: string) {
  return (await prisma.user.count({ where: { managerId: id, role: "MANAGER" } })) > 0;
}

function userAuditSnapshot(user: {
  username: string; role: "ADMIN" | "ROP" | "KNOWLEDGE_EDITOR" | "MANAGER"; managerId: string | null; isActive: boolean;
  position: string; hireDate: Date | null;
}) {
  return {
    username: user.username,
    role: user.role,
    managerId: user.managerId,
    isActive: user.isActive,
    position: user.position,
    hireDate: user.hireDate?.toISOString().slice(0, 10) || null,
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("employees_manage");
  if ("error" in access) return access.error;
  const requestId = requestIdFor(request);
  const { id } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.password && parsed.data.password.length < 12)) {
    return NextResponse.json({ error: "Проверьте данные сотрудника и пароль (минимум 12 символов)." }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { id }, include: { trainingAccess: true } });
  if (!existing) return NextResponse.json({ error: "Сотрудник не найден." }, { status: 404 });
  if (existing.role === "ADMIN" && existing.isActive && (parsed.data.role !== "ADMIN" || !parsed.data.isActive) && await canRemoveLastAdmin(id, existing.role, existing.isActive)) {
    return NextResponse.json({ error: "Нельзя отключить последнего активного администратора." }, { status: 400 });
  }

  const input = parsed.data;
  const managerId = input.role === "MANAGER" ? await validManagerId(input.managerId || "", id) : null;
  if (input.role === "MANAGER" && input.managerId && !managerId) return NextResponse.json({ error: "Руководителем может быть только активный руководитель." }, { status: 400 });
  if (input.role === "MANAGER" && !managerId) return NextResponse.json({ error: "Для менеджера выберите руководителя." }, { status: 400 });
  if (existing.role === "ROP" && (input.role !== "ROP" || !input.isActive) && await hasDirectReports(id)) {
    return NextResponse.json({ error: "Сначала назначьте другого руководителя всем менеджерам этого руководителя." }, { status: 400 });
  }
  const passwordChanged = Boolean(input.password);
  const methodChanged = input.role === "MANAGER" && Boolean(input.trainingMethod) && input.trainingMethod !== existing.trainingAccess?.method;
  const passwordHash = passwordChanged ? await argon2.hash(input.password!, { type: argon2.argon2id }) : undefined;
  const user = await prisma.$transaction(async (transaction) => {
    const updatedUser = await transaction.user.update({
      where: { id },
      data: {
        username: input.username, lastName: input.lastName, firstName: input.firstName, middleName: input.middleName,
        position: input.position, phone: input.phone, email: input.email || null, role: input.role, managerId, isActive: input.isActive,
        hireDate: input.hireDate ? new Date(`${input.hireDate}T00:00:00.000Z`) : null,
        ...(methodChanged ? {
          trainingAccess: {
            upsert: {
              create: { method: input.trainingMethod!, state: input.trainingMethod === "MAIN_PROGRAM" ? "FULL_ACCESS" : "TRAINEE", trialModuleId: 23 },
              update: { method: input.trainingMethod!, state: input.trainingMethod === "MAIN_PROGRAM" ? "FULL_ACCESS" : "TRAINEE", reviewRequestedAt: null, reviewedAt: null, reviewedById: null, decisionComment: "" },
            },
          },
        } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
    });
    if (passwordChanged) await transaction.session.deleteMany({ where: { userId: id } });
    await writeAuditEvent(transaction, {
      actorId: access.user.id,
      action: "user.updated",
      entity: "User",
      entityId: id,
      requestId,
      before: userAuditSnapshot(existing),
      after: userAuditSnapshot(updatedUser),
    });
    return updatedUser;
  });

  const response = NextResponse.json({ id: user.id });
  response.headers.set("X-Request-Id", requestId);
  if (passwordChanged && access.user.id === id) response.cookies.set(expiredSessionCookie());
  return response;
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("employees_manage");
  if ("error" in access) return access.error;
  const requestId = requestIdFor(_request);
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Сотрудник не найден." }, { status: 404 });
  if (target.role === "ADMIN" && target.isActive && await canRemoveLastAdmin(id, target.role, target.isActive)) {
    return NextResponse.json({ error: "Нельзя удалить последнего активного администратора." }, { status: 400 });
  }
  if (target.role === "ROP" && await hasDirectReports(id)) {
    return NextResponse.json({ error: "Сначала назначьте другого руководителя всем менеджерам этого руководителя." }, { status: 400 });
  }
  await prisma.$transaction(async (transaction) => {
    await writeAuditEvent(transaction, {
      actorId: access.user.id,
      action: "user.deleted",
      entity: "User",
      entityId: id,
      requestId,
      before: userAuditSnapshot(target),
    });
    await transaction.user.delete({ where: { id } });
  });
  const response = NextResponse.json({ ok: true });
  response.headers.set("X-Request-Id", requestId);
  return response;
}
