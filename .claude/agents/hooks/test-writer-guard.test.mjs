// Tests for test-writer-guard. Run from the repo root: node --test '.claude/agents/hooks/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkBash, checkContent, checkPath } from './test-writer-guard.mjs';

const GUARD = fileURLToPath(new URL('./test-writer-guard.mjs', import.meta.url));

const PATH_ALLOW = [
  'client/src/app/agents/_components/AgentCard/AgentCard.test.tsx',
  'client/src/lib/format-cost.test.ts',
  'client/src/test/setup.ts',
  'server/test/helpers/pg.ts',
  'server/test/new.it.test.ts',
  'server/src/adapters/mocks.ts',
  'reviewer-core/test/run.test.ts',
  'e2e/specs/08-x.flow.json',
  'server/INSIGHTS.md',
  'INSIGHTS.md',
];

const PATH_BLOCK = [
  'client/src/lib/format-cost.ts',
  'server/src/modules/agents/service.ts',
  'client/src/vendor/ui/primitives/Markdown.test.tsx',
  'server/src/db/migrations/0000_init.sql',
  '.claude/agents/test-writer.md',
  '.github/workflows/client.yml',
  'server/.env',
  'client/vitest.config.ts',
  'server/package.json',
  'e2e/run.ts',
  'e2e/specs/x.json',
  'client/src/x.it.test.ts',
  'client/node_modules/pkg/a.test.ts',
  '/tmp/x.test.ts',
  'server/test/../src/app.ts',
];

const CONTENT_BLOCK = ['it.only("x", () => {})', 'describe.only("x", () => {})', 'it.skip("x", () => {})', 'test.todo("x")', 'it.fails("x", () => {})', 'foo.only (bar)'];
const CONTENT_ALLOW = ['const d = hasDocker ? describe : describe.skip;', 'it("renders", () => { expect(x).toBe(1); });'];

const BASH_BLOCK = [
  'git add .',
  'git commit -m x',
  'gh pr create',
  'echo x > client/src/lib/api.ts',
  'cat >> server/src/app.ts',
  "sed -i '' s/a/b/ client/src/lib/api.ts",
  'cp a.ts server/src/x.ts',
  'tee server/src/x.ts',
  'rm client/src/lib/api.ts',
  'pnpm add -D msw',
  'npm i',
  'cd client && pnpm exec vitest run -u',
  'cd server && pnpm db:generate',
  './scripts/dev.sh',
  'cd e2e && npm run e2e:hermetic',
  'node -e "require(\'fs\').writeFileSync(\'x\', \'y\')"',
  'X=rm $X -rf .',
  'cd client && pnpm build',
];

const BASH_ALLOW = [
  'cd client && pnpm exec vitest run src/lib/format-cost.test.ts 2>&1 | tail -20',
  'pnpm typecheck > /dev/null',
  'git diff --name-only',
  'git status --short',
  'cd server && pnpm exec vitest run .it.test',
  'cd reviewer-core && npm test -- test/run.test.ts',
  'echo "git push" | grep push',
  'cd client && pnpm exec eslint --no-warn-ignored src/lib/format-cost.test.ts',
];

test('checkPath allows test files, helpers, mocks, flows, INSIGHTS', () => {
  for (const p of PATH_ALLOW) assert.equal(checkPath(p), null, p);
});

test('checkPath blocks source, config and protected paths', () => {
  for (const p of PATH_BLOCK) assert.ok(checkPath(p), p);
  assert.match(checkPath('.claude/agents/test-writer.md'), /test-writer/);
  assert.doesNotMatch(checkPath('.claude/agents/test-writer.md'), /implementer/);
});

test('checkContent blocks focus/skip/todo/fails calls, allows the Docker gate', () => {
  for (const t of CONTENT_BLOCK) assert.ok(checkContent(t), t);
  for (const t of CONTENT_ALLOW) assert.equal(checkContent(t), null, t);
});

test('checkBash blocks writes outside tests, deps, snapshots, db, stack', () => {
  for (const c of BASH_BLOCK) assert.ok(checkBash(c), c);
});

test('checkBash allows running tests and read-only git', () => {
  for (const c of BASH_ALLOW) assert.equal(checkBash(c), null, c);
});

function run(input) {
  return spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8' });
}

test('stdin: blocked write exits 2, allowed write exits 0, bad JSON exits 2', () => {
  const blocked = run(JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'client/src/lib/api.ts', content: 'x' } }));
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /test-writer-guard: blocked/);
  const focused = run(JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'client/src/lib/format-cost.test.ts', new_string: 'it.only("x", () => {})' } }));
  assert.equal(focused.status, 2);
  const ok = run(JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'client/src/lib/format-cost.test.ts', content: 'it("x", () => {})' } }));
  assert.equal(ok.status, 0);
  assert.equal(run('not json').status, 2);
});
