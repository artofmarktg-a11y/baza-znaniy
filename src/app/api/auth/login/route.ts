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

function isStrongBootstrapPassword(password: string | undefined) {
  return Boolean(
    password
    && password.length >= 16
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password),
  );
}

async function createFirstAdminFromBootstrapCredentials(username: string, password: string) {
  const bootstrapUsername = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase();
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!bootstrapUsername || !isStrongBootstrapPassword(bootstrapPassword)) return null;
  if (username !== bootstrapUsername || password !== bootstrapPassword) return null;

  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (existingAdmin) return null;

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  return prisma.user.upsert({
    where: { username },
    update: {
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
    create: {
      username,
      passwordHash,
      role: "ADMIN",
      firstName: "Administrator",
      isActive: true,
    },
  });
}

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
  const bootstrapUser = user ? null : await createFirstAdminFromBootstrapCredentials(username, parsed.data.password);
  const loginUser = user || bootstrapUser;
  const valid = loginUser?.isActive ? bootstrapUser ? true : await argon2.verify(loginUser.passwordHash, parsed.data.password) : false;
  if (!loginUser || !valid) {
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
  const session = await createSession(loginUser.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie(session.token, session.expiresAt));
  return response;
}
