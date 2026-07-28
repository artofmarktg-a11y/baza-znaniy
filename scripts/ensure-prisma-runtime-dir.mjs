import fs from "node:fs";
import path from "node:path";

const prismaRuntimeDir = path.join(process.cwd(), "node_modules", ".prisma");

fs.mkdirSync(prismaRuntimeDir, { recursive: true });
fs.writeFileSync(
  path.join(prismaRuntimeDir, ".keep"),
  "This directory is intentionally present for deployment builders that copy node_modules/.prisma.\n",
);

console.log("Ensured node_modules/.prisma exists");
