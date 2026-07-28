import argon2 from "argon2";
import { NextResponse } from "next/server";
import { z } from "zod";
import { expiredSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { isRussianPhone, normalizeRussianPhone } from "@/lib/phone";

const roleSchema = z.enum(["ADMIN", "ROP", "KNOWLEDGE_EDITOR", "MANAGER"]);
const phoneSchema = z.string().trim().max(50).transform(normalizeRussianPhone).refine(isRussianPhone);
const updateSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(80),
  password: z.string().max(256).optional(),
  lastName: z.string().trim().max(120), firstName: z.string().trim().max(120), middleName: z.string().trim().max(120),
  position: z.string().trim().max(160), phone: phoneSchema, email: z.string().trim().email().max(254).optional().or(z.literal("")),
  role: roleSchema, managerId: z.string().trim().cuid().optional().or(z.literal("")), isActive: z.boolean(), hireDate: z.string().date().optional().or(z.literal("")),
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("employees_manage");
  if ("error" in access) return access.error;
  const { id } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.password && parsed.data.password.length < 12)) {
    return NextResponse.json({ error: "Проверьте данные сотрудника и пароль (минимум 12 символов)." }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Сотрудник не найден." }, { status: 404 });
  if (existing.role === "ADMIN" && existing.isActive && (parsed.data.role !== "ADMIN" || !parsed.data.isActive) && await canRemoveLastAdmin(id, existing.role, existing.isActive)) {
    return NextResponse.json({ error: "Нельзя отключить последнего активного администратора." }, { status: 400 });
  }

  const input = parsed.data;
  const managerId = await validManagerId(input.managerId || "", id);
  if (input.managerId && !managerId) return NextResponse.json({ error: "Руководителем может быть только активный РОП." }, { status: 400 });
  const passwordChanged = Boolean(input.password);
  const passwordHash = passwordChanged ? await argon2.hash(input.password!, { type: argon2.argon2id }) : undefined;
  const user = await prisma.$transaction(async (transaction) => {
    if (existing.role === "ROP" && (input.role !== "ROP" || !input.isActive)) {
      await transaction.user.updateMany({ where: { managerId: id }, data: { managerId: null } });
    }
    const updatedUser = await transaction.user.update({
      where: { id },
      data: {
        username: input.username, lastName: input.lastName, firstName: input.firstName, middleName: input.middleName,
        position: input.position, phone: input.phone, email: input.email || null, role: input.role, managerId, isActive: input.isActive,
        hireDate: input.hireDate ? new Date(`${input.hireDate}T00:00:00.000Z`) : null,
        ...(passwordHash ? { passwordHash } : {}),
      },
    });
    if (passwordChanged) await transaction.session.deleteMany({ where: { userId: id } });
    return updatedUser;
  });

  const response = NextResponse.json({ id: user.id });
  if (passwordChanged && access.user.id === id) response.cookies.set(expiredSessionCookie());
  return response;
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("employees_manage");
  if ("error" in access) return access.error;
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Сотрудник не найден." }, { status: 404 });
  if (target.role === "ADMIN" && target.isActive && await canRemoveLastAdmin(id, target.role, target.isActive)) {
    return NextResponse.json({ error: "Нельзя удалить последнего активного администратора." }, { status: 400 });
  }
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
