import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const source = readFileSync(resolve(root, "src/app/training/TrainingSite.tsx"), "utf8");
const tokens = readFileSync(resolve(root, "src/app/styles/tokens.css"), "utf8");
const components = readFileSync(resolve(root, "src/app/styles/components.css"), "utf8");
const screens = readFileSync(resolve(root, "src/app/styles/screens.css"), "utf8");
const shell = readFileSync(resolve(root, "src/app/styles/shell.css"), "utf8");

const contracts = [
  [tokens, /--focus-ring: #[0-9a-f]{6};/i, "Не задан цвет общего focus ring."],
  [components, /:where\(a, button, input, select, textarea, summary, \[tabindex\]\):focus-visible/, "Нет общего focus ring для keyboard navigation."],
  [components, /outline: 2px solid var\(--focus-ring-inner\) !important;/, "Focus ring должен быть заметен поверх локальных стилей."],
  [components, /min-height: var\(--control-touch-height\);/, "Не закреплён mobile touch target 44 px."],
  [shell, /app-mobile-more-close \{ display: grid; width: var\(--control-touch-height\); height: var\(--control-touch-height\);/, "Кнопка закрытия mobile-меню должна иметь touch target 44 px."],
  [screens, /\.profile-page-avatar-edit \{[\s\S]*?width: var\(--control-touch-height\);[\s\S]*?height: var\(--control-touch-height\);/, "Редактирование аватара должно иметь touch target 44 px."],
  [source, /className="icon-btn"[^\n]*aria-label="Закрыть карточку сотрудника"/, "Иконочная кнопка редактора сотрудника не имеет accessible name."],
  [source, /className="trp-plan-close"[^\n]*aria-label=/, "Иконочная кнопка закрытия плана не имеет accessible name."],
  [source, /className="control-button control-button--secondary control-button--icon staff-action-icon"[^\n]*aria-label=/, "Меню действий сотрудника не имеет accessible name."],
  [source, /className="app-mobile-more-close"[^\n]*aria-label="Закрыть дополнительное меню"/, "Кнопка закрытия mobile-меню не имеет accessible name."],
  [source, /className="control-button control-button--primary control-button--header employees-add employees-add--header"[^\n]*aria-label="Добавить сотрудника"/, "Скрываемая на mobile кнопка добавления не имеет accessible name."],
  [source, /className=\{`control-button control-button--secondary control-button--rail employees-filter-toggle/, "Не найден контроль фильтров сотрудников."],
];

const focusOutlineSuppressed = [components, screens, shell]
  .flatMap((content) => [...content.matchAll(/[^{}]*:focus-visible[^{}]*\{[^}]*outline:\s*none[^}]*\}/g)])
  .map((match) => match[0].replace(/\s+/g, " ").trim());

const failures = contracts.filter(([content, pattern]) => !pattern.test(content)).map(([, , message]) => message);
if (focusOutlineSuppressed.length) failures.push("Найдены focus-visible правила, отключающие outline: " + focusOutlineSuppressed.join(" | "));

if (failures.length) {
  console.error("Accessibility baseline failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Accessibility baseline passed: shared focus, named icon actions and mobile touch targets are present.");
