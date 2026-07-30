import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const design = read('DESIGN.md');
const guide = read('qa/ui-regression/README.md');
const template = read('qa/ui-regression/TEMPLATE.md');

const required = [
  [design, 'Обязательный visual regression-check'],
  [design, '1440 px'],
  [design, '1024 px'],
  [design, '390 px'],
  [design, 'verify:ui-regression'],
  [guide, 'loading, error и empty'],
  [guide, 'focus-visible'],
  [template, '1440 × 1024'],
  [template, '1024 × 768'],
  [template, '390 × 844'],
  [template, 'Keyboard focus и взаимодействие'],
  [template, 'DESIGN.md'],
];

const failures = required
  .filter(([source, phrase]) => !source.includes(phrase))
  .map(([, phrase]) => `Missing required UI regression contract phrase: ${phrase}`);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('UI regression protocol check passed.');
