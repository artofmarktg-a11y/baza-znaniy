import argon2 from "argon2";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { isRussianPhone, normalizeRussianPhone } from "@/lib/phone";

const roleSchema = z.enum(["ADMIN", "ROP", "KNOWLEDGE_EDITOR", "MANAGER"]);
const phoneSchema = z.string().trim().max(50).transform(normalizeRussianPhone).refine(isRussianPhone);
const userSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(80),
  password: z.string().min(12).max(256),
  lastName: z.string().trim().max(120).default(""),
  firstName: z.string().trim().max(120).default(""),
  middleName: z.string().trim().max(120).default(""),
  position: z.string().trim().max(160).default(""),
  phone: phoneSchema.default(""),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  role: roleSchema.default("MANAGER"),
  managerId: z.string().trim().cuid().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  hireDate: z.string().date().optional().or(z.literal("")),
});

function publicUser(user: {
  id: string; username: string; lastName: string; firstName: string; middleName: string; position: string; phone: string; email: string | null;
  role: "ADMIN" | "ROP" | "KNOWLEDGE_EDITOR" | "MANAGER"; managerId: string | null; isActive: boolean; hireDate: Date | null; createdAt: Date;
  manager?: { username: string; lastName: string; firstName: string; middleName: string } | null;
}) {
  return {
    id: user.id,
    username: user.username,
    lastName: user.lastName,
    firstName: user.firstName,
    middleName: user.middleName,
    position: user.position,
    phone: user.phone,
    email: user.email,
    role: user.role,
    managerId: user.managerId || "",
    managerName: user.manager ? [user.manager.lastName, user.manager.firstName, user.manager.middleName].filter(Boolean).join(" ") || user.manager.username : "",
    isActive: user.isActive,
    hireDate: user.hireDate?.toISOString().slice(0, 10) || "",
    createdAt: user.createdAt.toISOString(),
  };
}

async function validManagerId(managerId: string, userId?: string) {
  if (!managerId) return null;
  if (managerId === userId) return undefined;
  const manager = await prisma.user.findFirst({ where: { id: managerId, role: "ROP", isActive: true }, select: { id: true } });
  return manager?.id;
}

export async function GET() {
  const access = await requirePermission("employees_view");
  if ("error" in access) return access.error;
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { username: "asc" }],
    include: { manager: { select: { username: true, lastName: true, firstName: true, middleName: true } } },
  });
  return NextResponse.json(users.map(publicUser));
}

export async function POST(request: Request) {
  const access = await requirePermission("employees_manage");
  if ("error" in access) return access.error;
  const parsed = userSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Проверьте данные сотрудника и пароль (минимум 12 символов)." }, { status: 400 });

  try {
    const input = parsed.data;
    const managerId = await validManagerId(input.managerId || "");
    if (input.managerId && !managerId) return NextResponse.json({ error: "Руководителем может быть только активный РОП." }, { status: 400 });
    const user = await prisma.user.create({
      data: {
        username: input.username,
        passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
        lastName: input.lastName,
        firstName: input.firstName,
        middleName: input.middleName,
        position: input.position,
        phone: input.phone,
        email: input.email || null,
        role: input.role,
        managerId,
        isActive: input.isActive,
        hireDate: input.hireDate ? new Date(`${input.hireDate}T00:00:00.000Z`) : null,
      },
      include: { manager: { select: { username: true, lastName: true, firstName: true, middleName: true } } },
    });
    return NextResponse.json(publicUser(user), { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "Сотрудник с таким логином или email уже существует." }, { status: 409 });
    }
    throw error;
  }
}
