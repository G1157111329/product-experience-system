import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/app/(main)/issues/page.tsx', 'utf8');

assert.match(source, /task:\s*TaskContext\s*\|\s*null/, 'issues must carry resolved task context before grouping');
assert.match(source, /if \(!i\.task_id\) return false;/, 'issue management must exclude only issues without a task ownership key');
assert.doesNotMatch(source, /if \(!i\.task\) return false;/, 'a delayed task join must not hide valid project issues');
assert.match(source, /if \(!issue\.task\)\s*\{[\s\S]*?unattributed:/, 'issues without a real task must never be classified as an unarchived report');
assert.match(source, /unreported-recipe:\$\{issue\.task\.id\}/, 'recipe issues with a real task must retain a task-scoped unarchived group');
assert.match(source, /unreported-record:\$\{issue\.task\.id\}/, 'sensory issues with a real task must retain a task-scoped unarchived group');
assert.match(source, /项目：\$\{issue\.task\.project_number/, 'unarchived group labels must expose the real project');
assert.match(source, /任务：\$\{issue\.task\.task_name\}/, 'unarchived group labels must expose the real task');
assert.doesNotMatch(source, /issue\.source_report_id \|\| 'no-report'/, 'all unreported issues must not collapse into one misleading non-standard group');
const fetchIssuesSource = source.slice(source.indexOf('const fetchIssues'), source.indexOf('const handleStatusChange'));
assert.doesNotMatch(fetchIssuesSource, /userTaskIds/, 'issue management must not truncate a user task list before the server applies access control');
assert.doesNotMatch(fetchIssuesSource, /\/api\/tasks\?pageSize=200/, 'issue management must not depend on the tasks API page-size cap');
assert.doesNotMatch(fetchIssuesSource, /params\.set\('task_ids'/, 'issue management must let the issues API apply the authoritative task scope');
assert.match(fetchIssuesSource, /new URLSearchParams\(\{ canonical: '1', limit: '500' \}\)/, 'issue management must request the canonical issue projection');

console.log('issues page grouping contract passed');
