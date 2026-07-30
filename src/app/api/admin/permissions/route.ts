import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { permissions, requirePermission } from "@/lib/permissions";
import { requestIdFor, writeAuditEvent } from "@/lib/audit";

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
  const requestId = requestIdFor(request);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректная матрица прав." }, { status: 400 });

  const current = await prisma.rolePermission.findMany({ select: { role: true, permission: true, allowed: true } });
  const currentByKey = new Map(current.map((item) => [`${item.role}:${item.permission}`, item.allowed]));
  const changes = roles.flatMap((role) => permissions.flatMap((permission) => {
    const before = currentByKey.get(`${role}:${permission}`) || false;
    const after = role === "ADMIN" || parsed.data.settings[role]?.[permission] === true;
    return before === after ? [] : [{ role, permission, before, after }];
  }));

  await prisma.$transaction(async (transaction) => {
    await Promise.all(roles.flatMap((role) => permissions.map((permission) => transaction.rolePermission.upsert({
      where: { role_permission: { role, permission } },
      create: { role, permission, allowed: role === "ADMIN" || parsed.data.settings[role]?.[permission] === true },
      update: { allowed: role === "ADMIN" || parsed.data.settings[role]?.[permission] === true },
    }))));
    if (changes.length) {
      await writeAuditEvent(transaction, {
        actorId: access.user.id,
        action: "permissions.updated",
        entity: "RolePermission",
        entityId: "matrix",
        requestId,
        changes,
      });
    }
  });
  const response = NextResponse.json({ ok: true });
  response.headers.set("X-Request-Id", requestId);
  return response;
}
