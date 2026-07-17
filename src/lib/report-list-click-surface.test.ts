import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/app/(main)/reports/page.tsx', 'utf8');

assert.match(source, /role="link"/, 'each standalone report card must expose a card-level navigation target');
assert.match(source, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*router\.push\(`\/reports\/\$\{r\.id\}`\);/, 'report-row controls must retain their own target when the card is clickable');
assert.match(source, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*handlePrint\(/, 'print actions must not trigger report navigation');

console.log('report list click-surface contract passed');
