import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return new PrismaClient({ adapter: new PrismaPg(connectionString) });
}

// During `prisma generate` in a running dev server the cached client can be
// older than the schema. Recreate it once when a newly added model is absent.
const cachedClientIsCurrent = Boolean(globalForPrisma.prisma?.rolePermission && globalForPrisma.prisma?.loginRateLimit && globalForPrisma.prisma?.notification && globalForPrisma.prisma?.trainingAssignment);
export const prisma = cachedClientIsCurrent ? globalForPrisma.prisma! : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
