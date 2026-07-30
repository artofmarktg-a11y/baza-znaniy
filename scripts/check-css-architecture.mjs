import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const root = process.cwd();
const files = [
  "src/app/styles/tokens.css",
  "src/app/styles/shell.css",
  "src/app/styles/components.css",
  "src/app/styles/screens.css",
];

const layoutProperties = new Set([
  "display", "position", "width", "min-width", "max-width", "height", "min-height", "max-height",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "grid-template", "grid-template-columns", "grid-template-rows",
  "flex", "flex-direction", "flex-wrap", "align-items", "align-content", "justify-content",
  "gap", "top", "right", "bottom", "left", "overflow", "overflow-x", "overflow-y",
]);

const seen = new Map();
const conflicts = [];

for (const relativePath of files) {
  const absolutePath = path.join(root, relativePath);
  const stylesheet = postcss.parse(fs.readFileSync(absolutePath, "utf8"), { from: absolutePath });

  stylesheet.walkRules((rule) => {
    const scopes = [];
    let parent = rule.parent;
    while (parent && parent.type !== "root") {
      if (parent.type === "atrule") scopes.unshift(`@${parent.name} ${parent.params}`);
      parent = parent.parent;
    }

    for (const declaration of rule.nodes || []) {
      if (declaration.type !== "decl" || !layoutProperties.has(declaration.prop)) continue;
      const key = `${scopes.join("|")}::${rule.selector}::${declaration.prop}`;
      const previous = seen.get(key);
      if (previous && previous.value !== declaration.value && !previous.important) {
        conflicts.push(`${relativePath}:${declaration.source.start.line} duplicates ${previous.file}:${previous.line} for ${rule.selector} → ${declaration.prop}`);
      }
      if (!previous || !previous.important || declaration.important) {
        seen.set(key, {
          file: relativePath,
          line: declaration.source.start.line,
          value: declaration.value,
          important: declaration.important,
        });
      }
    }
  });
}

const globalImports = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8").trim().split(/\r?\n/);
if (globalImports.length !== 5 || globalImports.some((line) => !line.startsWith("@import "))) {
  conflicts.push("src/app/globals.css must only declare the five stylesheet imports.");
}

if (conflicts.length) {
  console.error("CSS architecture check failed:\n" + conflicts.join("\n"));
  process.exit(1);
}

console.log("CSS architecture check passed: one canonical layout declaration per selector and breakpoint.");
