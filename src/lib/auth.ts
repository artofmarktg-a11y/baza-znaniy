import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const sessionCookieName = "knowledge_session";
const sessionLifetimeMs = 1000 * 60 * 60 * 24 * 7;

export type AuthenticatedUser = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  middleName: string;
  hasAvatar: boolean;
  role: "ADMIN" | "ROP" | "KNOWLEDGE_EDITOR" | "MANAGER";
};

export type AuthenticatedSession = {
  id: string;
  user: AuthenticatedUser;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toAuthenticatedUser(user: {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  middleName: string;
  hasAvatar: boolean;
  role: AuthenticatedUser["role"];
}): AuthenticatedUser {
  return user;
}

export async function getCurrentSession(): Promise<AuthenticatedSession | null> {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          middleName: true,
          hasAvatar: true,
          role: true,
          isActive: true,
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return { id: session.id, user: toAuthenticatedUser(session.user) };
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  return (await getCurrentSession())?.user || null;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);

  await prisma.session.deleteMany({
    where: { userId, expiresAt: { lt: new Date() } },
  });
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  return { token, expiresAt };
}

export async function revokeSession(token?: string) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export function sessionCookie(value: string, expiresAt: Date) {
  return {
    name: sessionCookieName,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function expiredSessionCookie() {
  return sessionCookie("", new Date(0));
}

export { sessionCookieName };
