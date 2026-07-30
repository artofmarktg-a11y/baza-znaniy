import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const components = read('src/app/styles/components.css');
const shell = read('src/app/styles/shell.css');
const screens = read('src/app/styles/screens.css');
const design = read('DESIGN.md');
const trainingSite = read('src/app/training/TrainingSite.tsx');

const checks = [
  [
    !shell.includes('.app-topbar-breadcrumb') &&
      /\.app-topbar-context h1,[\s\S]*?\.topbar-portaled-action/.test(shell) &&
      trainingSite.includes('TopbarActionSlotContext') &&
      trainingSite.includes('createPortal(<div className={`topbar-portaled-action'),
    'The topbar must contain the current section and its portaled local actions, not breadcrumbs.',
  ],
  [
    /\.role-admin,[\s\S]*?\.role-manager \{[\s\S]*?background: var\(--i9\);[\s\S]*?color: var\(--i2\);/.test(components),
    'Role badges must stay neutral on data-first surfaces.',
  ],
  [
    !/\.staff-avatar--admin \{ background: linear-gradient/.test(screens),
    'Employee avatars must not encode roles with decorative gradients.',
  ],
  [
    /\.qz-result--pass \{\s*background: #166534;\s*\}/.test(screens) &&
      /\.qz-result--fail \{\s*background: #991b1b;\s*\}/.test(screens),
    'Quiz outcomes must use solid semantic surfaces.',
  ],
  [
    /\.profile-deck-card--learning \{[^}]*background: var\(--surface\);/.test(screens),
    'The profile learning card must remain a clean working surface.',
  ],
  [
    design.includes('Контракт применения') && design.includes('не более двух') && design.includes('Topbar страницы'),
    'DESIGN.md must document the Quiet Technical Depth and topbar contracts.',
  ],
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);

if (failures.length) {
  console.error('Quiet Technical Depth check failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Quiet Technical Depth check passed.');
