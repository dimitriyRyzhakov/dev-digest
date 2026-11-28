// Tests for doc-writer-guard. Run from the repo root: node --test '.claude/agents/hooks/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPath } from './doc-writer-guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const GUARD = join(HERE, 'doc-writer-guard.mjs');

const ALLOWED = [
  'README.md',
  'client/README.md',
  'server/docs/review-flow.md',
  'e2e/docs/README.md',
  'server/src/modules/repo-intel/README.md',
  'docs/skills/README.md',
  'docs/skills/experiments/README.md',
];

const BLOCKED = [
  'server/INSIGHTS.md',
  'client/insights.md',
  'client/Insights.md',
  'server/docs/INSIGHTS.md',
  'AGENTS.md',
  'server/CLAUDE.md',
  'server/specs/README.md',
  'server/specs/M3-x.md',
  'e2e/specs/01-x.flow.json',
  'docs/skills/test-flakiness.md',
  'docs/agent-prompts/general-reviewer.md',
  'docs/skills/api-versioning-gate/SKILL.md',
  'server/src/app.ts',
  'server/docs/x.ts',
  'server/docs/../src/x.md',
  '.claude/agents/README.md',
  'client/src/vendor/ui/README.md',
  '../outside.md',
  '/tmp/outside.md',
  '',
];

test('allowlisted doc locations pass', () => {
  for (const p of ALLOWED) assert.equal(checkPath(p, REPO), null, p);
});

test('everything else is blocked with a reason', () => {
  for (const p of BLOCKED) assert.equal(typeof checkPath(p, REPO), 'string', p);
  assert.equal(typeof checkPath(undefined, REPO), 'string');
});

test('a symlinked folder cannot redirect a write outside the root', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dw-guard-'));
  try {
    const root = join(tmp, 'repo');
    const elsewhere = join(tmp, 'elsewhere');
    mkdirSync(join(root, 'server'), { recursive: true });
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(root, 'server', 'docs'));
    assert.match(checkPath('server/docs/x.md', root), /symlink/);
    assert.equal(checkPath('server/README.md', root), null);
    assert.equal(checkPath('client/docs/new/folder/x.md', root), null, 'new folders resolve via nearest ancestor');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

function run(stdin) {
  return spawnSync(process.execPath, [GUARD], { input: stdin, env: { ...process.env, CLAUDE_PROJECT_DIR: REPO } });
}

test('hook exit codes via stdin', () => {
  const blocked = run(JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'server/src/app.ts' } }));
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr.toString(), /^doc-writer-guard: blocked — /);
  assert.equal(run('not json').status, 2);
  assert.equal(run(JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'server/docs/flow.md' } })).status, 0);
  assert.equal(run(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'server/.env' } })).status, 0);
});
