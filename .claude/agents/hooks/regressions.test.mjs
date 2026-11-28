// Cross-guard regressions from the 5th self-review security pass (2026-11-27).
// Run from the repo root: node --test '.claude/agents/hooks/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
process.env.CLAUDE_PROJECT_DIR = ROOT;
const { checkReadonlyBash } = await import('./readonly-bash-guard.mjs');
const { checkBash: testWriterBash } = await import('./test-writer-guard.mjs');
const { checkBash: implementerBash } = await import('./implementer-guard.mjs');
const { gitArgsReason } = await import('./tool-flags.mjs');

// git options with an OPTIONAL value never take the next word, so the next word must still be checked.
const OPTIONAL_VALUE_DESYNC = [
  'git diff --color --output=server/src/pwned.ts',
  'git log --pretty --output=server/src/pwned.ts',
  'git diff --relative --output=server/src/pwned.ts',
  'git show --unified --output=server/src/pwned.ts',
  'git diff --color --output server/src/pwned.ts',
];

test('read-only and test-writer: optional-value git options cannot hide --output', () => {
  for (const cmd of OPTIONAL_VALUE_DESYNC) {
    assert.ok(checkReadonlyBash(cmd, ROOT), `readonly must block: ${cmd}`);
    assert.ok(testWriterBash(cmd, ROOT), `test-writer must block: ${cmd}`);
  }
});

test('git flag allowlist: =value forms and -U still work', () => {
  assert.equal(gitArgsReason('diff', ['--color=never', '--stat', 'origin/main...HEAD']), null);
  assert.equal(gitArgsReason('log', ['--pretty=oneline', '-5']), null);
  assert.equal(gitArgsReason('diff', ['-U0', 'HEAD~1']), null);
  assert.equal(gitArgsReason('diff', ['-U', 'HEAD~1']), null);
  assert.equal(gitArgsReason('log', ['-n', '5']), null);
  assert.ok(gitArgsReason('log', ['--format', '%H']), '--format needs the = form');
});

test('read-only: depcruise --config is pinned to the repo config (it is executed)', () => {
  const server = join(ROOT, 'server');
  assert.ok(checkReadonlyBash('pnpm exec depcruise src --config .env', server));
  assert.ok(checkReadonlyBash('pnpm exec depcruise src --config /Users/x/.devdigest/secrets.json', server));
  assert.ok(checkReadonlyBash('pnpm exec depcruise src --config other.cjs', server));
  assert.equal(checkReadonlyBash('pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err', server), null);
});

test('implementer: runner option values cannot smuggle gh', () => {
  for (const cmd of ['pnpm -C server exec gh repo view', 'pnpm --filter server exec gh pr list', 'corepack pnpm exec gh repo view', 'npx --yes gh pr list']) {
    assert.ok(implementerBash(cmd, ROOT), `must block: ${cmd}`);
  }
  assert.equal(implementerBash('pnpm -C server typecheck', ROOT), null);
});

test('implementer: git archive -o is a write target', () => {
  assert.ok(implementerBash('git archive -o .claude/settings.json HEAD', ROOT));
  assert.ok(implementerBash('git archive -o.github/workflows/client.yml HEAD', ROOT));
  assert.equal(implementerBash('git archive -o server/tmp/src.tar HEAD', ROOT), null);
});

test('implementer: git fetch cannot move local refs', () => {
  for (const cmd of ['git fetch . +old:refs/heads/other', 'git fetch --update-head-ok . +old:refs/heads/main', 'git fetch origin main:main', 'git fetch origin +main']) {
    assert.ok(implementerBash(cmd, ROOT), `must block: ${cmd}`);
  }
  assert.equal(implementerBash('git fetch origin', ROOT), null);
  assert.equal(implementerBash('git fetch origin main', ROOT), null);
});
