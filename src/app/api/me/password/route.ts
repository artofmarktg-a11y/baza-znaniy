import argon2 from "argon2";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256),
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  const parsed = passwordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Новый пароль должен содержать не менее 12 символов." }, { status: 400 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { passwordHash: true } });
  if (!await argon2.verify(user.passwordHash, parsed.data.currentPassword)) {
    return NextResponse.json({ error: "Текущий пароль указан неверно." }, { status: 401 });
  }

  const passwordHash = await argon2.hash(parsed.data.newPassword, { type: argon2.argon2id });
  const revokedSessions = await prisma.$transaction(async (transaction) => {
    await transaction.user.update({ where: { id: session.user.id }, data: { passwordHash } });
    return transaction.session.deleteMany({ where: { userId: session.user.id, id: { not: session.id } } });
  });
  return NextResponse.json({ ok: true, revokedSessions: revokedSessions.count });
}
