// Tests for readonly-bash-guard (architecture-reviewer, plan-verifier).
// Run from the repo root: node --test '.claude/agents/hooks/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
process.env.CLAUDE_PROJECT_DIR = ROOT;
const { checkReadonlyBash, checkReadPath } = await import('./readonly-bash-guard.mjs');
const GUARD = join(HERE, 'readonly-bash-guard.mjs');

const ALLOW = [
  ['git diff origin/main...HEAD --stat', ''],
  ['git -C . log --oneline -5', ''],
  ['git status 2>&1 | head -50', ''],
  ['git diff -U0 origin/main -- server/src/app.ts', ''],
  ['git ls-files --others --exclude-standard', ''],
  ['git rev-parse --show-toplevel', ''],
  ['cat server/.env.example', ''],
  ['head -n 40 .claude/agents/planner.md', ''],
  ['cd server && pnpm lint:arch', ''],
  ['cd server && pnpm typecheck', ''],
  ['pnpm run typecheck', 'client'],
  ['cd client && pnpm exec eslint --no-warn-ignored src/x.tsx', ''],
  ["cd server && pnpm exec vitest related --run --exclude '**/*.it.test.ts' src/a.ts", ''],
  ['cd server && pnpm exec vitest run .it.test 2>&1 | tail -30', ''],
  ['cd reviewer-core && npm run typecheck', ''],
  ['cd reviewer-core && npm test -- test/run.test.ts', ''],
  ['cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err', ''],
  ["node --test '.claude/agents/hooks/*.test.mjs'", ''],
  ['node --test .claude/agents/hooks/readonly-bash-guard.test.mjs', ''],
  // quoted metacharacters are arguments, not pipes / redirects (smoke-test false positives)
  [`git diff -U0 -G"process\\.env|from '@devdigest/shared'" HEAD~1..HEAD -- client/src`, ''],
  ["git log --oneline --grep='a -> b' -5", ''],
  ['git grep -n "foo|bar" -- server/src', ''],
  ['git blame -L 1,20 server/src/app.ts', ''],
];

const BLOCK = [
  ['pnpm lint:arch:baseline', 'server'],
  ['cd server && pnpm run lint:arch:baseline', ''],
  ['git commit -m x', ''],
  ['git push', ''],
  ['git checkout main', ''],
  ['git -c core.pager=sh log', ''],
  ['git -C /tmp log', ''],
  ['git diff --output=x', ''],
  ['git diff --no-index /etc/passwd x', ''],
  ['rm -rf x', ''],
  ['cat server/.env', ''],
  ['head .env.local', ''],
  ['cat ~/.devdigest/secrets.json', ''],
  ['cat ../outside.txt', ''],
  ['git log > out.txt', ''],
  ['cat <<EOF', ''],
  ['echo $(rm x)', ''],
  ['echo `rm x`', ''],
  ['cd client && pnpm exec eslint --fix src', ''],
  ['cd client && pnpm exec vitest -u', ''],
  ['cd client && pnpm exec vitest run -u', ''],
  ['cd server && pnpm exec vitest related src/a.ts', ''],
  ['cd server && pnpm exec vitest run --coverage', ''],
  ['npm test', ''],
  ['cd reviewer-core && pnpm typecheck', ''],
  ['cd reviewer-core && npm install', ''],
  ['pnpm build', 'client'],
  ['pnpm --filter server typecheck', ''],
  ['pnpm -C server typecheck', ''],
  ['cd server && pnpm db:migrate', ''],
  ['cd server && npx depcruise --init', ''],
  ['cd server && pnpm exec depcruise --init', ''],
  ['node x.mjs', ''],
  ['node -e "require(\'fs\').writeFileSync(\'x\',\'y\')"', ''],
  ['node --test server/test', ''],
  ['node --test .claude/agents/hooks/', ''],
  ['node --test .claude/agents/hooks/readonly-bash-guard.mjs', ''],
  ['X=rm $X -rf .', ''],
  ['sleep 100 &', ''],
  ['cd /tmp && ls', ''],
  ['cd ~ && ls', ''],
  ['echo hi', ''],
  ['tee x.txt', ''],
  ['sed -i s/a/b/ x', ''],
  ['curl https://example.com', ''],
  ['git grep -O vim foo', ''],
  ['git grep --open-files-in-pager=vim foo', ''],
  ['git log "$(rm x)"', ''],
  ['git log "`rm x`"', ''],
  ['git log "abc', ''],
  ['git log \\> out.txt', ''],
  ["git log 'x' > out.txt", ''],
];

test('read-only bash: allowlisted commands pass', () => {
  for (const [cmd, sub] of ALLOW) {
    assert.equal(checkReadonlyBash(cmd, join(ROOT, sub)), null, cmd);
  }
});

test('read-only bash: everything else is blocked with a reason', () => {
  for (const [cmd, sub] of BLOCK) {
    const r = checkReadonlyBash(cmd, join(ROOT, sub));
    assert.ok(typeof r === 'string' && r.length > 0, `expected block: ${cmd}`);
  }
});

test('baseline gets its own message', () => {
  assert.match(checkReadonlyBash('cd server && pnpm lint:arch:baseline', ROOT), /baseline/);
});

test('Read / Grep paths: secrets blocked, normal files allowed', () => {
  for (const p of ['server/.env', '.env', join(ROOT, 'client/.env.local'), '/Users/x/.devdigest/secrets.json']) {
    assert.ok(checkReadPath(p), p);
  }
  for (const p of ['server/.env.example', 'server/src/app.ts', '.claude/agents/planner.md', undefined]) {
    assert.equal(checkReadPath(p), null, String(p));
  }
});

function runHook(stdin) {
  return spawnSync('node', [GUARD], { input: stdin, env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT }, encoding: 'utf8' });
}

test('stdin: blocked → 2, allowed → 0, bad JSON → 2', () => {
  const blocked = runHook(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: ROOT }));
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /readonly-bash-guard: blocked/);
  const allowed = runHook(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: ROOT }));
  assert.equal(allowed.status, 0);
  const readSecret = runHook(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: join(ROOT, 'server/.env') } }));
  assert.equal(readSecret.status, 2);
  const grepGlob = runHook(JSON.stringify({ tool_name: 'Grep', tool_input: { pattern: 'KEY', glob: '**/.env*' } }));
  assert.equal(grepGlob.status, 2);
  assert.equal(runHook('not json').status, 2);
  assert.equal(runHook('').status, 2);
});
