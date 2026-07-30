import "dotenv/config";
import fs from "node:fs";
import { Client } from "pg";

const trainingData = JSON.parse(fs.readFileSync("src/data/training-data.json", "utf8"));
const lesson = trainingData.lessons.find((item) => item.id === 237);

if (!lesson) {
  throw new Error("Lesson 237 was not found in training-data.json");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query(
    'update "Lesson" set "title" = $1, "content" = $2, "durationMin" = $3, "updatedAt" = now() where "id" = $4',
    [lesson.title, lesson.content, lesson.duration_min, lesson.id],
  );

  const result = await client.query('select "content" from "Lesson" where "id" = $1', [lesson.id]);
  const content = result.rows[0]?.content || "";
  console.log({
    updated: true,
    hasPortrait: content.includes("/training/express/lesson-237-portrait.jpg"),
    hasRelationships: content.includes("/training/express/lesson-237-relationships.jpg"),
  });
} finally {
  await client.end();
}
