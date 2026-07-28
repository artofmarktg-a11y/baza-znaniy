import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });

  const [unread, notifications] = await Promise.all([
    prisma.notification.count({ where: { recipientId: user.id, readAt: null } }),
    prisma.notification.findMany({
      where: { recipientId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        kind: true,
        readAt: true,
        createdAt: true,
        metadata: true,
        actor: { select: { username: true, lastName: true, firstName: true, middleName: true } },
      },
    }),
  ]);

  return NextResponse.json({
    unread,
    notifications: notifications.map((notification) => ({
      id: notification.id,
      kind: notification.kind,
      read: Boolean(notification.readAt),
      createdAt: notification.createdAt.toISOString(),
      employeeName: notification.actor
        ? [notification.actor.lastName, notification.actor.firstName, notification.actor.middleName].filter(Boolean).join(" ") || notification.actor.username
        : "Сотрудник",
      moduleTitle: typeof notification.metadata === "object" && notification.metadata && "moduleTitle" in notification.metadata && typeof notification.metadata.moduleTitle === "string"
        ? notification.metadata.moduleTitle
        : "Модуль",
    })),
  });
}

export async function PATCH() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });

  await prisma.notification.updateMany({
    where: { recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
