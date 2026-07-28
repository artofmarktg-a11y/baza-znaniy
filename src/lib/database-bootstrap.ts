import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

let readyPromise: Promise<void> | null = null;

async function tableExists(client: Client, tableName: string) {
  const result = await client.query<{ exists: boolean }>(
    "select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = $1) as exists",
    [tableName],
  );
  return Boolean(result.rows[0]?.exists);
}

async function migrationFiles() {
  const migrationsRoot = path.join(process.cwd(), "prisma", "migrations");
  const entries = await fs.readdir(migrationsRoot, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return directories.map((directory) => path.join(migrationsRoot, directory, "migration.sql"));
}

async function applyMigrations(client: Client) {
  await client.query("begin");
  try {
    for (const file of await migrationFiles()) {
      const sql = await fs.readFile(file, "utf8");
      if (sql.trim()) {
        await client.query(sql);
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function ensureDatabaseReadyOnce() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const hasLoginRateLimit = await tableExists(client, "LoginRateLimit");
    if (!hasLoginRateLimit) {
      await applyMigrations(client);
    }
  } finally {
    await client.end();
  }
}

export async function ensureDatabaseReady() {
  readyPromise ||= ensureDatabaseReadyOnce();
  return readyPromise;
}
