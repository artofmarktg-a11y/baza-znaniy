import argon2 from "argon2";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, sessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clearAccountLoginRateLimit, loginRateLimitStatus, recordFailedLogin } from "@/lib/login-rate-limit";

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные для входа." }, { status: 400 });
  }

  const username = parsed.data.username.toLowerCase();
  const limit = await loginRateLimitStatus(request, username);
  if (limit.limited) {
    return NextResponse.json(
      { error: "Слишком много попыток входа. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const user = await prisma.user.findUnique({
    where: { username },
  });
  const valid = user?.isActive ? await argon2.verify(user.passwordHash, parsed.data.password) : false;
  if (!user || !valid) {
    const failure = await recordFailedLogin(request, username);
    if (failure.limited) {
      return NextResponse.json(
        { error: "Слишком много попыток входа. Попробуйте позже." },
        { status: 429, headers: { "Retry-After": String(failure.retryAfter) } },
      );
    }
    return NextResponse.json({ error: "Неверный логин или пароль." }, { status: 401 });
  }

  await clearAccountLoginRateLimit(request, username);
  const session = await createSession(user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie(session.token, session.expiresAt));
  return response;
}
