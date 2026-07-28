import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { permissions, requirePermission } from "@/lib/permissions";

const roles = ["ADMIN", "ROP", "KNOWLEDGE_EDITOR", "MANAGER"] as const;
const schema = z.object({
  // Accept a matrix saved by an already-open browser tab during a hot reload.
  // Only the current allow-list below is persisted; obsolete keys are ignored.
  settings: z.record(z.enum(roles), z.record(z.string(), z.boolean())),
});

export async function GET() {
  const access = await requirePermission("access_manage");
  if ("error" in access) return access.error;
  const records = await prisma.rolePermission.findMany();
  return NextResponse.json(records);
}

export async function PUT(request: Request) {
  const access = await requirePermission("access_manage");
  if ("error" in access) return access.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректная матрица прав." }, { status: 400 });

  await prisma.$transaction(
    roles.flatMap((role) => permissions.map((permission) => prisma.rolePermission.upsert({
      where: { role_permission: { role, permission } },
      create: { role, permission, allowed: role === "ADMIN" || parsed.data.settings[role]?.[permission] === true },
      update: { allowed: role === "ADMIN" || parsed.data.settings[role]?.[permission] === true },
    }))),
  );
  return NextResponse.json({ ok: true });
}
