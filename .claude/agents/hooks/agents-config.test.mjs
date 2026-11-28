// Config invariant for the subagent catalog (.claude/agents/*.md): every agent that
// may not write files (Write + Edit in disallowedTools) but has Bash or Read must run
// readonly-bash-guard on Bash|Read|Grep. Bash without the guard can still write
// (`>`, `rm`, `sed -i`, `node -e`), so "read-only by rule" is not enough.
// Run: node --test '.claude/agents/hooks/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = '.claude/agents/hooks/readonly-bash-guard.mjs';

function frontmatter(file) {
  const text = readFileSync(join(AGENTS_DIR, file), 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, `${file}: no frontmatter`);
  return m[1];
}

function list(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

const agents = readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md');

test('catalog is not empty', () => {
  assert.ok(agents.length >= 5, `expected agent files in ${AGENTS_DIR}`);
});

for (const file of agents) {
  const fm = frontmatter(file);
  const tools = list(fm, 'tools');
  const denied = list(fm, 'disallowedTools');
  const readOnly = denied.includes('Write') && denied.includes('Edit');
  if (!readOnly) continue;

  test(`${file}: read-only agent cannot write through Write/Edit/NotebookEdit`, () => {
    for (const t of ['Write', 'Edit', 'NotebookEdit']) {
      assert.ok(denied.includes(t), `${file}: ${t} must be in disallowedTools`);
      assert.ok(!tools.includes(t), `${file}: ${t} must not be in tools`);
    }
  });

  if (tools.includes('Bash')) {
    test(`${file}: read-only agent with Bash runs readonly-bash-guard on Bash|Read|Grep`, () => {
      assert.match(fm, /^hooks:\n\s+PreToolUse:/m, `${file}: no PreToolUse hooks`);
      const matcher = fm.match(/matcher:\s*"([^"]+)"/);
      assert.ok(matcher, `${file}: no hook matcher`);
      for (const t of ['Bash', 'Read', 'Grep']) {
        assert.ok(matcher[1].split('|').includes(t), `${file}: matcher must cover ${t}`);
      }
      assert.ok(fm.includes(GUARD), `${file}: hook must run ${GUARD}`);
    });
  }
}
