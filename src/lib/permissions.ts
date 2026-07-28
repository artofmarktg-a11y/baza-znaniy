import { NextResponse } from "next/server";
import { getCurrentUser, type AuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const permissions = [
  "training",
  "knowledge_manage",
  "team_progress_view",
  "employees_view",
  "employees_manage",
  "access_manage",
] as const;

export type Permission = (typeof permissions)[number];

function isPermission(value: string): value is Permission {
  return (permissions as readonly string[]).includes(value);
}

/** Administrators always retain access, even if a stored matrix row is changed. */
export async function hasPermission(user: AuthenticatedUser, permission: Permission) {
  if (user.role === "ADMIN") return true;

  const rule = await prisma.rolePermission.findFirst({
    where: { role: user.role, permission, allowed: true },
    select: { allowed: true },
  });
  return rule !== null;
}

export async function getUserPermissions(user: AuthenticatedUser): Promise<Permission[]> {
  if (user.role === "ADMIN") return [...permissions];

  const rules = await prisma.rolePermission.findMany({
    where: { role: user.role, allowed: true },
    select: { permission: true },
  });
  return rules.map((rule) => rule.permission).filter(isPermission);
}

export async function requirePermission(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Требуется авторизация." }, { status: 401 }) };
  }
  if (!await hasPermission(user, permission)) {
    return { error: NextResponse.json({ error: "Недостаточно прав." }, { status: 403 }) };
  }
  return { user };
}
