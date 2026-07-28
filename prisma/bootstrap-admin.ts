import "dotenv/config";
import argon2 from "argon2";
import { prisma } from "../src/lib/db";

async function main() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const isStrongPassword = Boolean(
    password
    && password.length >= 16
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password),
  );
  if (!username || !isStrongPassword) {
    throw new Error("Set BOOTSTRAP_ADMIN_USERNAME and a new 16+ character BOOTSTRAP_ADMIN_PASSWORD with upper- and lowercase letters, numbers, and a special character.");
  }

  const [existingAdmin, existingUsername] = await Promise.all([
    prisma.user.findFirst({ where: { role: "ADMIN" }, select: { username: true } }),
    prisma.user.findUnique({ where: { username }, select: { username: true } }),
  ]);
  if (existingAdmin) {
    throw new Error(`An administrator (${existingAdmin.username}) already exists. Use the employee administration screen to change passwords; do not rerun bootstrap.`);
  }
  if (existingUsername) {
    throw new Error(`The username '${username}' already exists. Choose another username for the first administrator.`);
  }

  await prisma.user.create({
    data: {
      username,
      passwordHash: await argon2.hash(password!, { type: argon2.argon2id }),
      role: "ADMIN",
      firstName: "Администратор",
      isActive: true,
    },
  });
  console.info(`Administrator '${username}' has been created. Remove BOOTSTRAP_ADMIN_PASSWORD from the environment now.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
