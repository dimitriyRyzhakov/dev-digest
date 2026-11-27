#!/usr/bin/env node
// PreToolUse guard for the `test-writer` subagent (.claude/agents/test-writer.md).
// stdin = PreToolUse JSON ({ tool_name, tool_input, cwd }); exit 2 + stderr reason blocks the call.
// Layered on implementer-guard (git writes, gh, baseline, compose down, broad rm, client build,
// .claude/**, .env*, workflows, vendor/ui, tracked migrations), then deny-by-default for writes:
// only test files, test helpers, mocks.ts, e2e flow specs and INSIGHTS.md may be written.
// Fails closed: unparsable stdin or a write without file_path is blocked.
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { checkBash as baseBash, checkPath as basePath } from './implementer-guard.mjs';
import { gitSubcommand, segments } from './shell-segments.mjs';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const reword = (reason) => (reason ? reason.replace(/the implementer/g, 'the test-writer') : null);

const ALLOWED_PATHS = [
  /^(client|server|reviewer-core)\/.+\.test\.tsx?$/, // unit / RTL tests (.it.test only under server, see below)
  /^server\/test\/.+/, // server test helpers and fixtures
  /^server\/src\/adapters\/mocks\.ts$/, // shared test doubles
  /^client\/src\/test\/.+/, // client vitest setup / render helpers
  /^e2e\/specs\/[^/]+\.flow\.json$/, // deterministic e2e flows
  /^(INSIGHTS\.md|(client|server|reviewer-core|e2e)\/INSIGHTS\.md)$/, // engineering-insights append
];

function toRel(filePath, cwd = ROOT) {
  const abs = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  return { abs, rel: relative(ROOT, abs).split(sep).join('/') };
}

/** Write/Edit target check: implementer rules first, then the tests-only allowlist. */
export function checkPath(filePath, cwd = ROOT) {
  if (!filePath || typeof filePath !== 'string') return 'no file_path given.';
  const { abs, rel } = toRel(filePath, cwd);
  const base = reword(basePath(abs));
  if (base) return base;
  if (rel.split('/').includes('node_modules')) return `${rel} is inside node_modules.`;
  if (/\.it\.test\.tsx?$/.test(rel) && !rel.startsWith('server/')) {
    return `${rel}: *.it.test.ts (Docker integration) files live only under server/.`;
  }
  if (ALLOWED_PATHS.some((re) => re.test(rel))) return null;
  return `${rel} is source/config, not a test — report the bug or needed change instead of editing it.`;
}

const FOCUS_OR_SKIP = /\b(?:it|test|describe|suite|bench)\.(?:only|skip|todo|fails)\s*\(|\.only\s*\(/;

/** Added test text must not focus, skip, todo or expect-fail tests (the `describe.skip;` Docker gate is fine). */
export function checkContent(text) {
  if (typeof text !== 'string' || text === '') return null;
  const m = text.match(FOCUS_OR_SKIP);
  return m ? `\`${m[0].trim()}\` focuses or skips tests — never skip, focus, todo or .fails a test to get green.` : null;
}

const GIT_EXTRA = new Set(['add', 'apply', 'am', 'mv', 'rm', 'update-index', 'commit-tree']);
const PNPM_DEPS = new Set(['add', 'install', 'i', 'remove', 'rm', 'uninstall', 'un', 'update', 'up', 'upgrade']);
const NPM_DEPS = new Set(['install', 'i', 'ci', 'add', 'uninstall', 'un', 'remove', 'rm', 'update', 'up', 'upgrade']);
const DB_SCRIPTS = /^db:(generate|migrate|seed|push)/;
const SNAPSHOT_UPDATE = (a) => a === '-u' || a === '--update' || a.startsWith('--update=') || a === '--update-snapshots';

/** Strip harmless fd redirects so `2>&1` / `>/dev/null` are neither split on `&` nor treated as file writes. */
function stripSafeRedirects(command) {
  return command.replace(/\d*>&\d+/g, ' ').replace(/&>\s*\/dev\/null/g, ' ').replace(/\d*>>?\s*\/dev\/null/g, ' ');
}

function segmentRule(words, raw, dir) {
  const [cmd, ...args] = words;
  const nonFlags = args.filter((a) => !a.startsWith('-'));
  const pathCheck = (p) => checkPath(p.replace(/^['"]|['"]$/g, ''), dir);

  if (cmd.startsWith('$')) return 'a variable in command position hides what runs; spell the command out.';
  if (cmd === 'git') {
    const sub = gitSubcommand(words);
    if (sub && GIT_EXTRA.has(sub)) return `git ${sub} changes the index/working tree; the main session owns git state.`;
  }
  if (cmd === 'pnpm' && PNPM_DEPS.has(args[0])) return 'installing or changing dependencies is not allowed — recommend it in the report.';
  if (cmd === 'npm' && NPM_DEPS.has(args[0])) return 'installing or changing dependencies is not allowed — recommend it in the report.';
  if ((cmd === 'pnpm' || cmd === 'npm') && args.some((a) => DB_SCRIPTS.test(a))) {
    return 'db:generate/migrate/seed touch migrations or the local DB; integration tests use testcontainers.';
  }
  if ((cmd === 'pnpm' || cmd === 'npm') && args.some((a) => /^e2e(:|$)/.test(a))) {
    return 'e2e scripts start or clobber the stack; run flows only against an already running stack via `npm test` in e2e/.';
  }
  if (words.some((w) => /(^|\/)scripts\/(dev|e2e)\.sh$/.test(w))) return 'scripts/dev.sh and scripts/e2e.sh start or clobber the local stack.';
  const runsTests = words.includes('vitest') || ((cmd === 'pnpm' || cmd === 'npm') && args.includes('test'));
  if (runsTests && args.some(SNAPSHOT_UPDATE)) return 'updating snapshots (-u) to get green is not allowed; fix the test or report the change.';

  if (cmd === 'sed' && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) return 'sed -i edits files in place; use the Edit tool on test files.';
  if (cmd === 'perl' && args.some((a) => /^-[a-zA-Z]*[ie]/.test(a))) return 'perl -i/-e can write files; use the Edit tool on test files.';
  if ((cmd === 'node' || cmd === 'tsx' || cmd === 'bun' || cmd === 'deno') && args.some((a) => ['-e', '--eval', '-p', '--print'].includes(a))) {
    return 'inline scripts can write files past this guard; use Write/Edit on test files.';
  }
  if (/^python3?$/.test(cmd) && args.includes('-c')) return 'inline scripts can write files past this guard; use Write/Edit on test files.';

  if (['cp', 'install', 'ln'].includes(cmd) && nonFlags.length > 0) {
    const reason = pathCheck(nonFlags[nonFlags.length - 1]);
    if (reason) return `${cmd} target blocked: ${reason}`;
  }
  if (['mv', 'touch', 'truncate', 'tee', 'rm', 'unlink'].includes(cmd)) {
    for (const t of nonFlags) {
      const reason = pathCheck(t);
      if (reason) return `${cmd} target blocked: ${reason}`;
    }
  }
  for (const m of raw.matchAll(/>>?\s*([^\s;&|()<>]+)/g)) {
    const reason = pathCheck(m[1]);
    if (reason) return `redirect target blocked: ${reason}`;
  }
  return null;
}

/** Bash check: implementer rules first, then test-writer extras per simple command. */
export function checkBash(command, cwd = ROOT) {
  const base = reword(baseBash(command, cwd));
  if (base) return base;
  let dir = cwd;
  for (const raw of stripSafeRedirects(command).split(/\$\(|[;&|()\n`]/)) {
    const words = segments(raw)[0];
    if (!words) continue;
    if (words[0] === 'cd' && words[1]) { dir = resolve(dir, words[1]); continue; }
    const reason = segmentRule(words, raw, dir);
    if (reason) return reason;
  }
  return null;
}

export function checkTool(input) {
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  if (tool === 'Bash') return checkBash(String(ti.command || ''), input.cwd || ROOT);
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') {
    const pathReason = checkPath(ti.file_path);
    if (pathReason) return pathReason;
    if (tool === 'Write') return checkContent(ti.content);
    if (tool === 'Edit') return checkContent(ti.new_string);
    for (const e of Array.isArray(ti.edits) ? ti.edits : []) {
      const reason = checkContent(e && e.new_string);
      if (reason) return reason;
    }
  }
  return null;
}

async function main() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  let input;
  try {
    input = JSON.parse(data || '{}');
  } catch {
    process.stderr.write('test-writer-guard: blocked — unparsable hook input.\n');
    return 2;
  }
  const reason = checkTool(input);
  if (reason) {
    process.stderr.write(`test-writer-guard: blocked — ${reason}\n`);
    return 2;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
