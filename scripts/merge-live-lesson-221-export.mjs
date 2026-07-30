import fs from "node:fs";

const exportPath = "scripts/getcourse-express-html-export.json";
const livePath = "scripts/getcourse-lesson-221-live.json";

const exportData = JSON.parse(fs.readFileSync(exportPath, "utf8"));
const liveLesson = JSON.parse(fs.readFileSync(livePath, "utf8"));
const index = exportData.lessons.findIndex((lesson) => String(lesson.sourceId) === "348703451");

if (index < 0) {
  throw new Error("Lesson 348703451 was not found in getcourse-express-html-export.json");
}

exportData.lessons[index] = {
  ...exportData.lessons[index],
  ...liveLesson,
  sourceIndex: exportData.lessons[index].sourceIndex,
  streamText: exportData.lessons[index].streamText,
};
exportData.exportedAt = new Date().toISOString();

fs.writeFileSync(exportPath, `${JSON.stringify(exportData, null, 2)}\n`, "utf8");
console.log({
  updatedSourceId: liveLesson.sourceId,
  htmlLen: liveLesson.stats?.htmlLen,
  iframes: liveLesson.stats?.iframes,
});
