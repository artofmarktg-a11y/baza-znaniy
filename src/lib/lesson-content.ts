export type LessonContentBlock = {
  id: "text" | "image" | "warning" | "table" | "steps" | "question" | "scheme";
  title: string;
  description: string;
  html: string;
};

export const lessonContentBlocks: LessonContentBlock[] = [
  {
    id: "text",
    title: "Текст",
    description: "Заголовок и основной абзац",
    html: `<section class="lesson-block lesson-text">
  <h2>Заголовок раздела</h2>
  <p>Коротко объясните главное правило или действие.</p>
</section>`,
  },
  {
    id: "image",
    title: "Изображение",
    description: "Адаптивная иллюстрация с подписью",
    html: `<figure class="lesson-image">
  <img src="https://example.com/image.jpg" alt="Опишите изображение" />
  <figcaption>Подпись к изображению</figcaption>
</figure>`,
  },
  {
    id: "warning",
    title: "Предупреждение",
    description: "Важное правило или риск",
    html: `<aside class="lesson-callout lesson-callout--warning">
  <strong>Важно</strong>
  <p>Опишите, чего нельзя делать и почему.</p>
</aside>`,
  },
  {
    id: "table",
    title: "Таблица",
    description: "Таблица с безопасной прокруткой",
    html: `<div class="lesson-table">
  <table>
    <thead><tr><th>Параметр</th><th>Значение</th></tr></thead>
    <tbody><tr><td>Пример</td><td>Замените текст</td></tr></tbody>
  </table>
</div>`,
  },
  {
    id: "steps",
    title: "Шаги",
    description: "Последовательность действий",
    html: `<ol class="lesson-steps">
  <li><strong>Шаг 1.</strong> Опишите первое действие.</li>
  <li><strong>Шаг 2.</strong> Опишите следующее действие.</li>
  <li><strong>Шаг 3.</strong> Опишите ожидаемый результат.</li>
</ol>`,
  },
  {
    id: "question",
    title: "Вопрос",
    description: "Самопроверка после материала",
    html: `<section class="lesson-question">
  <strong>Проверьте себя</strong>
  <p>Как вы примените это правило в разговоре с клиентом?</p>
</section>`,
  },
  {
    id: "scheme",
    title: "Схема",
    description: "Адаптивная схема из карточек",
    html: `<section class="lesson-scheme">
  <div class="lesson-scheme-card"><strong>Шаг 1</strong><span>Первое действие</span></div>
  <div class="lesson-scheme-card"><strong>Шаг 2</strong><span>Второе действие</span></div>
  <div class="lesson-scheme-card"><strong>Результат</strong><span>Что должен получить клиент</span></div>
</section>`,
  },
];

export function validateMobileLessonContent(html: string) {
  const issues: string[] = [];
  const fixedWidthPattern = /(?:min-)?width\s*:\s*(\d+)px/gi;
  let fixedWidth: RegExpExecArray | null;
  while ((fixedWidth = fixedWidthPattern.exec(html))) {
    if (Number(fixedWidth[1]) > 360) {
      issues.push(`Фиксированная ширина ${fixedWidth[1]} px не поместится на большинстве телефонов.`);
      break;
    }
  }
  if (/<table\b/i.test(html) && !/class\s*=\s*["'][^"']*lesson-table[^"']*["']/i.test(html)) {
    issues.push("Таблицу нужно поместить в блок «Таблица», чтобы на mobile она прокручивалась безопасно.");
  }
  if (/<img\b/i.test(html) && !/\balt\s*=\s*["'][^"']+/.test(html)) {
    issues.push("У изображения нет содержательного alt-текста.");
  }
  if (/<svg\b/i.test(html) && !/\bviewbox\s*=\s*["']/i.test(html)) {
    issues.push("У SVG нет viewBox: на mobile схема может масштабироваться некорректно.");
  }
  if (/grid-template-columns\s*:\s*[^;]*(?:\d+px\s+){1,}/i.test(html)) {
    issues.push("Замените фиксированную сетку на блок «Схема» — он перестраивается в одну колонку на телефоне.");
  }
  return issues;
}
