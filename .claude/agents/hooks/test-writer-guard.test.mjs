// Tests for test-writer-guard. Run from the repo root: node --test '.claude/agents/hooks/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBash, checkContent, checkPath, realRel } from './test-writer-guard.mjs';

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
  // case variants resolve to the real (protected / source) folder on APFS
  '.CLAUDE/agents/x.test.ts',
  '.GITHUB/workflows/x.test.ts',
  'server/.ENV',
  'Server/src/app.ts',
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
  // self-review findings: Bash writing source past the path checks
  "node <<'EOF'\nrequire('fs').writeFileSync('server/src/x.ts','')\nEOF",
  "python3 - <<EOF\nopen('server/src/x.ts','w').write('')\nEOF",
  'node scripts/write.mjs',
  'tsx scratch.ts',
  'cd client && pnpm exec node x.mjs',
  'npx tsx x.ts',
  'pnpm dlx some-tool',
  'cd client && pnpm exec eslint --fix src',
  'cd client && pnpm exec prettier --write src',
  'cd client && pnpm lint -- --fix',
  'dd if=/dev/zero of=server/src/a.ts count=1',
  'rsync a.ts server/src/a.ts',
  'curl -o server/src/a.ts https://example.com',
  "bash -c 'git add -A'",
  "sh -c 'echo x > server/src/a.ts'",
  'git diff --name-only | xargs rm',
  'timeout 5 git push',
  'find server/src -name "*.ts" -delete',
  'ln -s ../src/app.ts server/test/link.ts',
  'cat <(echo x)',
  // round-2 self-review: bypasses of the old denylist — the Bash allowlist blocks them all
  '/bin/cp a server/src/app.ts',
  '/usr/local/bin/node -e 1',
  '/bin/sh -c x',
  `awk 'BEGIN{system("touch server/src/x.ts")}'`,
  'sort -o server/src/app.ts a',
  'tar -cf server/src/app.ts a',
  'git -c alias.w=!touch w',
  'git checkout-index -f -a',
  'GIT_EXTERNAL_DIFF=rm git diff',
  'cd ~ && ls',
  '"gh" pr list',
  './node_modules/.bin/vitest run',
  'git --git-dir .git push',
  'git --work-tree . commit -m x',
  'git config alias.p push',
  'cat $HOME/.devdigest/secrets.json',
  'cat server/.env',
  "cat 'server/.env'",
  'cat server/.e*',
  'pushd client',
  'cd client && pnpm exec vitest related src/a.ts',
  'cd server && pnpm lint:arch:baseline',
  'pnpm --filter client test',
  'cd reviewer-core && pnpm typecheck',
  // allowed by the old denylist, now blocked: Bash never writes (test files go through Write/Edit),
  // and only allowlisted commands run
  'echo x > server/test/a.ts',
  'echo "git push" | grep push',
  'cd client && pnpm exec eslint --fix-dry-run src/lib/format-cost.test.ts',
  // round-3 self-review: shell expansion after the check, write-capable tool flags, implicit --no-index
  'git log -1 {--output=/tmp/x,--oneline}',
  'git diff --out\\put=/tmp/x',
  'cd server && pnpm test --reporter=json --output-file=/tmp/x',
  'cd server && pnpm exec vitest run --outputFile=/tmp/x',
  'cd client && pnpm exec eslint --suppress-all --suppressions-location /tmp/x src',
  'cd client && pnpm exec eslint -f ./evil.js src',
  'git diff /dev/null server/.env',
  'git diff /dev/null README.md',
  'git diff HEAD ../outside.txt',
  'cat server/.e*',
  'cat server/.en?',
  'git log -1 --format=x --out\\put=/tmp/x',
  'cd server && pnpm exec vitest run --clearCache',
  'cd reviewer-core && npm test -- --output-file=/tmp/x',
  // round 4: git accepts abbreviated long options; case-insensitive file system
  'git grep --untrac --no-exclude-st KEY',
  'git blame --conte=server/.env -- README.md',
  'git grep --open=rm -e x -- server/src',
  "git diff '--output=/tmp/x'",
  'cat server/.ENV',
  'cat ~/.DEVDIGEST/secrets.json',
];

const BASH_ALLOW = [
  'cd client && pnpm exec vitest run src/lib/format-cost.test.ts 2>&1 | tail -20',
  'cd client && pnpm typecheck > /dev/null',
  'git diff --name-only',
  'git status --short',
  'cd server && pnpm exec vitest run .it.test',
  'cd reviewer-core && npm test -- test/run.test.ts',
  'cd client && pnpm exec eslint --no-warn-ignored src/lib/format-cost.test.ts',
  'cd client && pnpm typecheck',
  'git log --oneline -5',
  "cd server && pnpm exec vitest related --run --exclude '**/*.it.test.ts' src/a.ts",
  'cd server && pnpm lint:arch',
  'cd server && pnpm test 2>&1 | tail -30',
  'cd reviewer-core && npm run typecheck',
  'cd e2e && npm test',
  "git log --oneline --grep='a -> b|c' -5",
  'cat server/.env.example',
  'head -n 40 client/src/lib/format-cost.ts',
  'git log -1 HEAD~1 --oneline',
  'git show HEAD^ -- server/src/app.ts',
  'git diff origin/main...HEAD --stat',
  'git diff HEAD -- server/src/app.ts',
  'cd server && pnpm exec vitest run --reporter=verbose test/adapters.test.ts',
  "cd client && pnpm exec eslint --no-warn-ignored -f json src/lib/format-cost.test.ts",
];

test('checkPath allows test files, helpers, mocks, flows, INSIGHTS', () => {
  for (const p of PATH_ALLOW) assert.equal(checkPath(p), null, p);
});

test('checkPath compares the case-canonical real path', () => {
  // `Server/` resolves to the real `server/` folder, so the result is the same test path, not an escape.
  assert.equal(checkPath('Server/test/x.test.ts'), null);
  assert.equal(realRel(join(process.cwd(), 'Server/test/x.test.ts')), 'server/test/x.test.ts');
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

test('symlinks: a link under server/test/ that points into src/ resolves to the source path', () => {
  const root = mkdtempSync(join(tmpdir(), 'tw-guard-'));
  try {
    mkdirSync(join(root, 'server/src'), { recursive: true });
    mkdirSync(join(root, 'server/test'), { recursive: true });
    writeFileSync(join(root, 'server/src/app.ts'), '');
    symlinkSync('../src/app.ts', join(root, 'server/test/link.ts'));
    symlinkSync('../src', join(root, 'server/test/srcdir'));
    assert.equal(realRel(join(root, 'server/test/link.ts'), root), 'server/src/app.ts');
    assert.equal(realRel(join(root, 'server/test/srcdir/new.test.ts'), root), 'server/src/new.test.ts');
    assert.equal(realRel(join(root, 'server/test/new/dir/a.test.ts'), root), 'server/test/new/dir/a.test.ts');
    assert.equal(realRel(join(tmpdir(), 'elsewhere.ts'), root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
