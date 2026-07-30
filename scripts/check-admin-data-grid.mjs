import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const source = readFileSync(resolve(root, "src/app/training/TrainingSite.tsx"), "utf8");
const componentStyles = readFileSync(resolve(root, "src/app/styles/components.css"), "utf8");
const screenStyles = readFileSync(resolve(root, "src/app/styles/screens.css"), "utf8");

const contracts = [
  [source, /employees-list data-grid data-grid--directory/, "«Сотрудники» должны использовать data-grid--directory."],
  [source, /employees-toolbar data-grid__toolbar/, "Control rail сотрудников должен использовать data-grid__toolbar."],
  [source, /staff-grid data-grid__surface/, "Список сотрудников должен использовать общую data-surface."],
  [source, /staff-card data-grid__row/, "Строка сотрудника должна использовать data-grid__row."],
  [source, /data-grid__action-menu/, "Меню действий сотрудника должно использовать общий контракт."],
  [source, /aria-haspopup="menu"/, "Триггер меню действий должен объявлять меню для assistive technology."],
  [source, /event\.key === "Escape"/, "Меню действий должно закрываться по Escape."],
  [source, /access-desktop-matrix data-grid data-grid--matrix data-grid__surface/, "Матрица прав должна использовать data-grid--matrix."],
  [source, /trp-assignments data-grid data-grid--assignments/, "Назначения должны использовать data-grid--assignments."],
  [source, /filteredEmployees\.map\(/, "Список сотрудников не должен обрезаться до фиксированного числа строк."],
  [componentStyles, /\.data-grid__action-popover \{ z-index: 30; \}/, "Popover должен использовать общий слой data-grid."],
  [screenStyles, /\.staff-main \{\s*min-width: 0;/, "Длинное ФИО должно иметь сжимаемую колонку."],
  [screenStyles, /\.staff-name \{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/, "Длинное ФИО должно сокращаться без поломки сетки."],
  [screenStyles, /\.staff-cell-label \{ display: block;/, "Mobile-строка должна показывать метки полей."],
];

const failures = contracts.filter(([content, pattern]) => !pattern.test(content)).map(([, , message]) => message);

if (failures.length) {
  console.error("Admin data-grid contract failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Admin data-grid contract passed: directory, matrix, assignments, actions and mobile cards share the reference pattern.");
