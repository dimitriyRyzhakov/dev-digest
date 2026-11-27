// Regression tests for implementer-guard after moving the shell parser to shell-segments.mjs.
// Run from the repo root: node --test '.claude/agents/hooks/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBash, checkPath } from './implementer-guard.mjs';
import { gitSubcommand, segments } from './shell-segments.mjs';

test('segments splits in command position and drops env assignments', () => {
  assert.deepEqual(segments('cd server && FOO=1 pnpm test | tail -5'), [['cd', 'server'], ['pnpm', 'test'], ['tail', '-5']]);
  assert.equal(gitSubcommand(['git', '-C', '.', '-c', 'a=b', '--no-pager', 'log']), 'log');
});

test('implementer bash: blocks git writes and gh, allows mentions', () => {
  assert.match(checkBash('git push origin x'), /git push/);
  assert.match(checkBash('cd server && git -C .. commit -m x'), /git commit/);
  assert.match(checkBash('gh pr list'), /gh is not allowed/);
  assert.match(checkBash('pnpm lint:arch:baseline'), /baseline/);
  assert.equal(checkBash('echo "git push" | grep push'), null);
  assert.equal(checkBash('cd server && pnpm typecheck'), null);
});

test('implementer paths: blocks .claude, env, tracked migrations; allows source', () => {
  assert.match(checkPath('.claude/agents/x.md'), /\.claude/);
  assert.match(checkPath('server/.env'), /secrets/);
  assert.match(checkPath('server/src/db/migrations/0000_init.sql'), /immutable/);
  assert.equal(checkPath('server/.env.example'), null);
  assert.equal(checkPath('client/src/lib/api.ts'), null);
});
