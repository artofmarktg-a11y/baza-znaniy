import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const htmlExportPath = path.resolve(__dirname, "getcourse-express-html-export.json");
const trainingDataPath = path.resolve(rootDir, "src", "data", "training-data.json");
const EXPRESS_DAY_MODULE_IDS = new Set([24, 25]);
const READING_WPM = 200;
const LOCAL_ASSET_OVERRIDES = {
  "348703979": [
    {
      from: "https://fs22.getcourse.ru/fileservice/file/download/a/910773/sc/217/h/98d5f7140fb04b68cd90c6ecf493699b.mp3",
      to: "/training/express/lesson-224-call-01.mp3",
    },
    {
      from: "https://fs27.getcourse.ru/fileservice/file/download/a/910773/sc/193/h/19c2f922e672e2fac46d11908171ffbb.mp3",
      to: "/training/express/lesson-224-call-02.mp3",
    },
    {
      from: "https://fs19.getcourse.ru/fileservice/file/download/a/910773/sc/478/h/ff20d651db60653484572c52f9853672.mp3",
      to: "/training/express/lesson-224-call-03.mp3",
    },
    {
      from: "https://fs27.getcourse.ru/fileservice/file/download/a/910773/sc/236/h/f57b7099d6fd20900aa6f05ddaa2f641.mp3",
      to: "/training/express/lesson-224-call-04.mp3",
    },
    {
      from: "https://fs26.getcourse.ru/fileservice/file/download/a/910773/sc/238/h/9724dbeeeb31800c28270ab33f951eff.mp3",
      to: "/training/express/lesson-224-call-05.mp3",
    },
    {
      from: "https://fs19.getcourse.ru/fileservice/file/download/a/910773/sc/58/h/5788890f762af29db511b7c14620df06.mp3",
      to: "/training/express/lesson-224-call-06.mp3",
    },
    {
      from: "https://fs18.getcourse.ru/fileservice/file/download/a/910773/sc/290/h/80f7d3206ee388e3f70a131afeb7dfb5.mp3",
      to: "/training/express/lesson-224-call-07.mp3",
    },
    {
      from: "https://fs24.getcourse.ru/fileservice/file/download/a/910773/sc/163/h/57990b6dc27bc50d2d792f92f49a836a.mp3",
      to: "/training/express/lesson-224-call-08.mp3",
    },
    {
      from: "https://fs24.getcourse.ru/fileservice/file/download/a/910773/sc/376/h/d24696a8dcc2b04bb4fd13ee29caf0a8.mp3",
      to: "/training/express/lesson-224-call-09.mp3",
    },
    {
      from: "https://fs01.getcourse.ru/fileservice/file/download/a/910773/sc/235/h/26f01537412cdaeabdb46642949fc5ea.mp3",
      to: "/training/express/lesson-224-call-10.mp3",
    },
  ],
  "348703956": [
    {
      from: "https://fs01.getcourse.ru/fileservice/file/download/a/910773/sc/171/h/d84ef316e1d948837245f36d1fe666cf.jpg",
      to: "/training/express/lesson-237-portrait.jpg",
    },
    {
      from: "https://fs16.getcourse.ru/fileservice/file/download/a/910773/sc/281/h/99f09a77d2d6747e8f8e45af92ffb6e3.jpg",
      to: "/training/express/lesson-237-relationships.jpg",
    },
  ],
};

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function decodeHtmlAttribute(value) {
  return String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function stripDayPrefix(title) {
  return normalizeText(title)
    .replace(/^День\s+\d+\.\s*/i, "")
    .replace(/Не выполнено.*$/i, "")
    .replace(/Нужно выполнить.*$/i, "")
    .replace(/Все видео.*$/i, "")
    .trim();
}

function durationMinutes(text) {
  const words = (String(text || "").match(/[A-Za-zА-Яа-яЁё0-9]+/g) || []).length;
  return Math.max(1, Math.ceil(words / READING_WPM));
}

function absolutizeUrl(url) {
  if (!url || /^(https?:|mailto:|tel:|data:|#)/i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://skillmetallobazav.getcourse.ru${url}`;
  return url;
}

function applyLocalAssetOverrides(html, lesson) {
  let result = html;
  for (const item of LOCAL_ASSET_OVERRIDES[String(lesson.sourceId)] || []) {
    result = result.replaceAll(item.from, item.to);
  }
  return result;
}

function cleanGetCourseHtml(html, lesson) {
  let result = String(html || "");

  result = result
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  result = result.replace(/\s(?:data-v-[\w-]+|data-editable|data-param|data-main-class|data-setting-editable|contenteditable|draggable|tabindex)="[^"]*"/gi, "");
  result = result.replace(/\s(?:data-v-[\w-]+|data-editable|data-param|data-main-class|data-setting-editable|contenteditable|draggable|tabindex)(?=[\s>])/gi, "");

  result = result.replace(/\s(href|src|data-iframe-src|data-img-src)="([^"]*)"/gi, (_match, attr, value) => {
    return ` ${attr}="${escapeHtml(absolutizeUrl(decodeHtmlAttribute(value)))}"`;
  });
  result = result.replace(/<audio\b([^>]*)>/gi, (_match, attrs) => {
    const hasControls = /\scontrols(?:=|\s|>|$)/i.test(attrs);
    const hasPreload = /\spreload=/i.test(attrs);
    return `<audio${attrs}${hasControls ? "" : " controls"}${hasPreload ? "" : ' preload="metadata"'}>`;
  });

  result = result.replace(/<form\b[\s\S]*?<\/form>/gi, "");
  result = result.replace(/<button\b[\s\S]*?<\/button>/gi, "");
  result = result.replace(/<input\b[^>]*>/gi, "");
  result = result.replace(/\s{2,}/g, " ");

  return applyLocalAssetOverrides(result.trim(), lesson);
}

function buildLessonHtml(lesson) {
  const title = normalizeText(lesson.lessonTitle || lesson.streamText || `Урок ${lesson.sourceIndex}`);
  const cleanedHtml = cleanGetCourseHtml(lesson.contentHtml, lesson);
  const badges = [
    `Урок ${lesson.sourceIndex} из 25`,
    lesson.stats?.tables ? `Таблицы: ${lesson.stats.tables}` : "",
    lesson.stats?.images ? `Изображения: ${lesson.stats.images}` : "",
    lesson.stats?.iframes ? `Видео: ${lesson.stats.iframes}` : "",
    lesson.stats?.videos ? `Видео: ${lesson.stats.videos}` : "",
    lesson.stats?.links ? `Ссылки: ${lesson.stats.links}` : "",
  ].filter(Boolean);

  return [
    `<!-- getcourse-source-id:${escapeHtml(lesson.sourceId)} -->`,
    `<div class="gc-exact-import" data-source-id="${escapeHtml(lesson.sourceId)}">`,
    '<section class="gc-exact-header">',
    '<div>',
    '<span class="gc-exact-kicker">Экспресс-курс GetCourse</span>',
    `<h2>${escapeHtml(title)}</h2>`,
    `<div class="gc-exact-badges">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}</div>`,
    `<p><a href="${escapeHtml(lesson.sourceUrl)}" target="_blank" rel="noopener noreferrer">Открыть исходный урок в GetCourse</a></p>`,
    "</div>",
    "</section>",
    `<div class="gc-exact-body">${cleanedHtml}</div>`,
    "</div>",
  ].join("\n");
}

function updateTrainingData(exportData, trainingData) {
  const targetLessons = trainingData.lessons
    .filter((lesson) => EXPRESS_DAY_MODULE_IDS.has(lesson.module_id))
    .sort((a, b) => a.id - b.id);

  if (targetLessons.length !== exportData.lessons.length) {
    throw new Error(`Expected ${exportData.lessons.length} express lessons, found ${targetLessons.length}`);
  }

  const updates = [];
  for (let index = 0; index < exportData.lessons.length; index += 1) {
    const source = exportData.lessons[index];
    const target = targetLessons[index];
    const title = stripDayPrefix(source.lessonTitle || source.streamText || target.title) || target.title;
    const content = buildLessonHtml(source);
    const durationMin = durationMinutes(source.contentText);

    target.title = title;
    target.content = content;
    target.duration_min = durationMin;

    updates.push({ id: target.id, title, content, durationMin });
  }

  return updates;
}

async function updateDatabase(updates) {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set, database update skipped.");
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    for (const lesson of updates) {
      await client.query(
        'update "Lesson" set "title" = $1, "content" = $2, "durationMin" = $3, "updatedAt" = now() where "id" = $4',
        [lesson.title, lesson.content, lesson.durationMin, lesson.id],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

const exportData = JSON.parse(fs.readFileSync(htmlExportPath, "utf8"));
const trainingData = JSON.parse(fs.readFileSync(trainingDataPath, "utf8"));
const updates = updateTrainingData(exportData, trainingData);

fs.writeFileSync(trainingDataPath, `${JSON.stringify(trainingData, null, 2)}\n`, "utf8");
await updateDatabase(updates);

console.log(`Imported exact GetCourse HTML for ${updates.length} express lessons.`);
console.log(`Tables: ${exportData.lessons.reduce((sum, lesson) => sum + (lesson.stats?.tables || 0), 0)}`);
console.log(`Images: ${exportData.lessons.reduce((sum, lesson) => sum + (lesson.stats?.images || 0), 0)}`);
console.log(`Iframes: ${exportData.lessons.reduce((sum, lesson) => sum + (lesson.stats?.iframes || 0), 0)}`);
