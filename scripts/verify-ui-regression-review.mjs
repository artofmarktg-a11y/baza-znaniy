import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reviewArgument = process.argv.find((argument) => argument.startsWith('--review='))
  ?? (process.argv[2] === '--review' ? process.argv[3] : undefined);

if (!reviewArgument) {
  console.error('Usage: npm run verify:ui-regression -- --review qa/ui-regression/reviews/<review-id>.md');
  process.exit(1);
}

const reviewPath = reviewArgument.startsWith('--review=') ? reviewArgument.slice('--review='.length) : reviewArgument;
const absoluteReviewPath = resolve(process.cwd(), reviewPath);

if (!existsSync(absoluteReviewPath)) {
  console.error(`UI regression review not found: ${reviewPath}`);
  process.exit(1);
}

const review = readFileSync(absoluteReviewPath, 'utf8');
const requiredPhrases = [
  '# UI regression',
  'DESIGN.md',
  '1440 × 1024',
  '1024 × 768',
  '390 × 844',
  'Loading',
  'Error',
  'Empty',
  'Keyboard focus',
  'Popover / dialog',
  'PASS',
];

const failures = requiredPhrases
  .filter((phrase) => !review.includes(phrase))
  .map((phrase) => `Review is missing: ${phrase}`);

const capturePaths = [...review.matchAll(/`(qa\/ui-regression\/captures\/[^`]+\/(?:1440|1024|390)\.png)`/g)]
  .map((match) => match[1]);

for (const width of ['1440', '1024', '390']) {
  const path = capturePaths.find((candidate) => candidate.endsWith(`/${width}.png`));
  if (!path) {
    failures.push(`Review must link a ${width}.png capture.`);
  } else if (!existsSync(resolve(process.cwd(), path))) {
    failures.push(`Capture is missing from the repository: ${path}`);
  }
}

if (/\*\*Статус:\*\*\s*FAIL/i.test(review)) {
  failures.push('Review status is FAIL. Resolve regressions before closing the UI task.');
}

if (failures.length) {
  console.error('UI regression review failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log(`UI regression review passed: ${reviewPath}`);
