import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

const windowMs = 15 * 60 * 1000;
const accountLimit = 5;
const ipLimit = 30;
const cleanupIntervalMs = 60 * 60 * 1000;
let lastCleanupAt = 0;

type RateLimitKey = {
  key: string;
  limit: number;
};

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function keysFor(request: Request, username: string): RateLimitKey[] {
  const ip = clientIp(request);
  return [
    { key: `login-account:${digest(`${ip}:${username}`)}`, limit: accountLimit },
    { key: `login-ip:${digest(ip)}`, limit: ipLimit },
  ];
}

function retryAfterSeconds(blockedUntil: Date) {
  return Math.max(1, Math.ceil((blockedUntil.getTime() - Date.now()) / 1000));
}

async function pruneExpiredRateLimits() {
  const now = Date.now();
  if (now - lastCleanupAt < cleanupIntervalMs) return;
  lastCleanupAt = now;
  await prisma.loginRateLimit.deleteMany({
    where: { updatedAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } },
  });
}

export async function loginRateLimitStatus(request: Request, username: string) {
  await pruneExpiredRateLimits();
  const keys = keysFor(request, username);
  const now = new Date();
  const records = await prisma.loginRateLimit.findMany({ where: { key: { in: keys.map((item) => item.key) } } });
  const blockedUntil = records
    .map((record) => record.blockedUntil)
    .filter((value): value is Date => Boolean(value && value > now))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return blockedUntil ? { limited: true as const, retryAfter: retryAfterSeconds(blockedUntil) } : { limited: false as const, keys };
}

async function recordFailure({ key, limit }: RateLimitKey) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const existing = await prisma.loginRateLimit.findUnique({ where: { key } });

  if (!existing || existing.windowStartedAt <= windowStart || (existing.blockedUntil && existing.blockedUntil <= now)) {
    return prisma.loginRateLimit.upsert({
      where: { key },
      create: { key, attempts: 1, windowStartedAt: now },
      update: { attempts: 1, windowStartedAt: now, blockedUntil: null },
    });
  }

  const record = await prisma.loginRateLimit.update({
    where: { key },
    data: { attempts: { increment: 1 } },
  });
  if (record.attempts < limit) return record;

  return prisma.loginRateLimit.update({
    where: { key },
    data: { blockedUntil: new Date(now.getTime() + windowMs) },
  });
}

export async function recordFailedLogin(request: Request, username: string) {
  const keys = keysFor(request, username);
  const records = await Promise.all(keys.map(recordFailure));
  const blockedUntil = records
    .map((record) => record.blockedUntil)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return blockedUntil ? { limited: true as const, retryAfter: retryAfterSeconds(blockedUntil) } : { limited: false as const };
}

export async function clearAccountLoginRateLimit(request: Request, username: string) {
  const [accountKey] = keysFor(request, username);
  await prisma.loginRateLimit.deleteMany({ where: { key: accountKey.key } });
}
