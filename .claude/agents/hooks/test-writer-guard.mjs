#!/usr/bin/env node
// PreToolUse guard for the `test-writer` subagent (.claude/agents/test-writer.md).
// stdin = PreToolUse JSON ({ tool_name, tool_input, cwd }); exit 2 + stderr reason blocks the call.
// Edit / Write: implementer-guard's protected paths first (.claude/**, .env*, workflows, vendor/ui,
// tracked migrations), then deny-by-default: only test files, test helpers, mocks.ts, e2e flow specs
// and INSIGHTS.md, checked on their REAL path (symlinks resolved).
// Bash: an ALLOWLIST (read-only git, ls/cat/head/tail/wc, package test / typecheck / lint commands
// in their package dir) — no redirects, substitutions, env prefixes, wrappers or interpreters.
// Every word is checked for shell expansion first (unsafeShellChar: escapes, braces, globs, `$`,
// leading `~`), so the words approved here are exactly what the shell runs; tool flags are allowlisted.
// Fails closed: unparsable stdin, a write without file_path, or an unresolvable path is blocked.
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { checkPath as basePath } from './implementer-guard.mjs';
import { envPrefixes, hasDynamicCommand, realTarget, unsafeShellChar, wrapperReason } from './shell-segments.mjs';
import { eslintArgsReason, gitArgsReason, testScriptArgsReason, vitestArgsReason } from './tool-flags.mjs';

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

/**
 * Repo-relative POSIX path of where `abs` really lands (symlinks resolved), or null when it resolves
 * outside `root` or cannot be resolved.
 */
export function realRel(abs, root = ROOT) {
  try {
    // Both sides via realpathSync.native, so letter case is canonical (APFS: `Server/` → `server/`)
    // and the allowlist below is compared on the path the file system really writes to.
    const rel = relative(realpathSync.native(root), realTarget(abs));
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null;
    return rel.split(sep).join('/');
  } catch {
    return null;
  }
}

/** Write/Edit target check: implementer rules first, then the tests-only allowlist on the real path. */
export function checkPath(filePath, cwd = ROOT) {
  if (!filePath || typeof filePath !== 'string') return 'no file_path given.';
  const abs = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath);
  const base = reword(basePath(abs));
  if (base) return base;
  const rel = realRel(abs);
  if (rel === null) return `${filePath} resolves outside the repository or cannot be resolved (symlink?).`;
  const realBase = reword(basePath(resolve(ROOT, rel)));
  if (realBase) return `${filePath} resolves to ${rel}: ${realBase}`;
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

// ---------------------------------------------------------------------------------------------
// Bash: ALLOWLIST. Test files are written only through Edit/Write (path allowlist above), so Bash
// needs no write power at all: read-only git / file readers, and the package test / typecheck / lint
// commands, each in its own package directory. Everything else is blocked (fails closed).
// ---------------------------------------------------------------------------------------------

const GIT_ALLOWED = new Set(['diff', 'log', 'show', 'status', 'ls-files', 'rev-parse', 'grep', 'blame']);
// git options before the subcommand that redirect git to other repos/configs or run programs.
const GIT_GLOBAL_BANNED = /^(-c|--config-env(=.*)?|--exec-path(=.*)?|--git-dir(=.*)?|--work-tree(=.*)?|--namespace(=.*)?|--super-prefix(=.*)?|--list-cmds(=.*)?)$/;
const FILE_READERS = new Set(['ls', 'cat', 'head', 'tail', 'wc']);
const GLOB_OR_ESCAPE = /[*?[\]{}\\]/;
const MASK = '\u0001';

/**
 * Same-length copy of `text` with shell metacharacters inside quotes replaced by MASK, so a quoted
 * `|`, `>` or `;` is an argument, not a pipe / redirect. Inside "…" `$` and backticks stay visible
 * (they expand there). Unterminated quote → null.
 */
export function maskQuoted(text) {
  let out = '';
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote === null) {
      if (c === '\\' && i + 1 < text.length) { out += c + text[++i]; continue; }
      if (c === "'" || c === '"') quote = c;
      out += c;
      continue;
    }
    if (c === quote) { quote = null; out += c; continue; }
    if (quote === '"' && c === '\\' && i + 1 < text.length) { out += c + text[++i]; continue; }
    const meta = quote === "'" ? /[|;&<>()`$\n]/ : /[|;&<>()\n]/;
    out += meta.test(c) ? MASK : c;
  }
  return quote === null ? out : null;
}

/** Split one simple command into words, removing quotes. Returns [{ word, raw }]. */
function tokenize(seg) {
  const words = [];
  let word = '';
  let raw = '';
  let quote = null;
  let has = false;
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (quote) {
      raw += c;
      if (c === quote) { quote = null; continue; }
      if (quote === '"' && c === '\\' && i + 1 < seg.length) { word += seg[++i]; raw += seg[i]; continue; }
      word += c;
      continue;
    }
    if (/\s/.test(c)) {
      if (has) words.push({ word, raw });
      word = ''; raw = ''; has = false;
      continue;
    }
    has = true;
    raw += c;
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '\\' && i + 1 < seg.length) { word += seg[++i]; raw += seg[i]; continue; }
    word += c;
  }
  if (has) words.push({ word, raw });
  return words;
}

function insideRoot(abs) {
  const rel = relative(ROOT, abs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function pkgOf(dir) {
  const rel = relative(ROOT, dir).split(sep).join('/');
  return rel === '' ? '.' : rel;
}

function secretReason(p) {
  // Case-insensitive: APFS resolves `~/.DEVDIGEST` and `server/.ENV` to the real files.
  const norm = p.split(sep).join('/');
  if (/(^|\/)\.devdigest(\/|$)/i.test(norm)) return `${p} is inside ~/.devdigest (API keys); never read it.`;
  const base = norm.replace(/\/+$/, '').split('/').pop();
  if (/^\.env(\..*)?$/i.test(base) && base.toLowerCase() !== '.env.example') return `${p} is a secrets file (.env*); never read it.`;
  return null;
}

/** A literal repo path argument: no ~, globs or escapes, inside the repo, not a secret. */
function checkRepoPath(cmd, w, dir) {
  if (w === '/dev/null') return `${cmd} ${w}: /dev/null as a path makes git diff read files outside the work tree; not allowed.`;
  if (w.startsWith('~')) return `${cmd} ${w}: ~ paths are not allowed.`;
  if (GLOB_OR_ESCAPE.test(w)) return `${cmd} ${w}: glob / escape characters are not allowed in paths.`;
  if (!insideRoot(resolve(dir, w))) return `${cmd} ${w}: path is outside the repository.`;
  return secretReason(w);
}

const SNAPSHOT_UPDATE = /^(-u|--update(=.*)?|--update-snapshots)$/;

/** Extra args of a package `test` script: vitest flags from the shared allowlist only. */
function checkVitestArgs(args) {
  if (args.some((a) => SNAPSHOT_UPDATE.test(a))) return 'updating snapshots (-u) to get green is not allowed; fix the test or report the change.';
  return testScriptArgsReason(args);
}

function checkGit(args, dir) {
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (GIT_GLOBAL_BANNED.test(a)) return `git ${a} can point git at other configs/repos or run programs; not allowed.`;
    if (a === '-C') {
      const t = args[i + 1];
      if (!t || GLOB_OR_ESCAPE.test(t) || t.startsWith('~') || !insideRoot(resolve(dir, t))) return 'git -C must point inside the repository.';
      i++;
      continue;
    }
    if (a === '--no-pager' || a === '-P') continue;
    if (a.startsWith('-')) return `git ${a}: only -C and --no-pager are allowed before the subcommand.`;
    break;
  }
  const sub = args[i];
  if (!sub || !GIT_ALLOWED.has(sub)) return `git ${sub ?? ''} is not allowed for the test-writer; read-only git only (${[...GIT_ALLOWED].join(', ')}).`;
  const rest = args.slice(i + 1);
  // Exact-spelling flag allowlist per subcommand: git also accepts abbreviations (`--untrac`,
  // `--conte=`, `--open=`), which a denylist of full names would miss.
  const flagReason = gitArgsReason(sub, rest);
  if (flagReason) return flagReason;
  // Every non-flag argument that could be a path is checked, not only those after `--`: git diff
  // silently switches to --no-index when a path lies outside the work tree (`git diff /dev/null x`).
  const dd = rest.indexOf('--');
  for (let k = 0; k < rest.length; k++) {
    const p = rest[k];
    if (k === dd) continue;
    if (dd < 0 || k < dd) {
      if (p.startsWith('-')) continue;
      if (!looksLikePath(p, dir)) continue; // a revision (HEAD~1, origin/main...HEAD) or a pattern
    }
    if (p.startsWith(':')) continue; // pathspec magic
    const r = checkRepoPath('git', p, dir);
    if (r) return r;
  }
  return null;
}

/** A git argument is treated as a path when it is absolute, /dev/null, has ../, or names an existing file. */
function looksLikePath(p, dir) {
  if (p === '/dev/null' || isAbsolute(p) || p.startsWith('~') || p.startsWith('../') || p === '..') return true;
  if (/^\.env/i.test(p.split('/').pop()) || /\.devdigest/i.test(p)) return true;
  try {
    return existsSync(resolve(dir, p));
  } catch {
    return true;
  }
}

function checkPnpm(args, dir) {
  const pkg = pkgOf(dir);
  const [a0, a1, ...more] = args;
  const script = a0 === 'run' ? a1 : a0;
  const tail = a0 === 'run' ? more : [a1, ...more].filter((x) => x !== undefined);
  if (script && script.startsWith('lint:arch')) {
    if (script !== 'lint:arch') return 'lint:arch:baseline would hide new onion violations; never allowed.';
    return pkg === 'server' && tail.length === 0 ? null : 'pnpm lint:arch runs only in server/, without arguments.';
  }
  if (script === 'typecheck') {
    return (pkg === 'server' || pkg === 'client') && tail.length === 0 ? null : `pnpm typecheck runs only in server/ or client/ (cwd: ${pkg}).`;
  }
  if (script === 'test') {
    if (pkg !== 'server' && pkg !== 'client') return `pnpm test runs only in server/ or client/ (cwd: ${pkg}).`;
    return checkVitestArgs(tail);
  }
  const tool = a0 === 'exec' ? a1 : a0;
  const targs = a0 === 'exec' ? more : [a1, ...more].filter((x) => x !== undefined);
  if (tool === 'vitest') {
    if (pkg !== 'server' && pkg !== 'client') return `vitest runs only in server/ or client/ (cwd: ${pkg}).`;
    if (targs.some((a) => SNAPSHOT_UPDATE.test(a))) return 'updating snapshots (-u) to get green is not allowed; fix the test or report the change.';
    return vitestArgsReason(targs);
  }
  if (tool === 'eslint') {
    if (pkg !== 'client') return `eslint runs only in client/ (cwd: ${pkg}).`;
    if (targs.some((x) => /^--fix/.test(x))) return `eslint --fix rewrites files; report lint fixes instead.`;
    return eslintArgsReason(targs);
  }
  if (['add', 'install', 'i', 'remove', 'rm', 'update', 'up', 'upgrade', 'uninstall'].includes(a0)) {
    return 'installing or changing dependencies is not allowed — recommend it in the report.';
  }
  return `pnpm ${args.join(' ')} is not allowed for the test-writer (typecheck, test, lint:arch, exec vitest|eslint).`;
}

function checkNpm(args, dir) {
  const pkg = pkgOf(dir);
  const [a0, a1, ...more] = args;
  const script = a0 === 'run' ? a1 : a0;
  const tail = a0 === 'run' ? more : [a1, ...more].filter((x) => x !== undefined);
  if (pkg === 'reviewer-core') {
    if (script === 'typecheck' && a0 === 'run' && tail.length === 0) return null;
    if (script === 'test') {
      if (tail.length > 0 && tail[0] !== '--') return 'npm test arguments go after `--`.';
      return checkVitestArgs(tail.slice(1));
    }
  }
  if (pkg === 'e2e' && script === 'test' && tail.length === 0) return null;
  if (['install', 'i', 'ci', 'add', 'uninstall', 'remove', 'rm', 'update', 'up'].includes(a0)) {
    return 'installing or changing dependencies is not allowed — recommend it in the report.';
  }
  if (script && /^e2e(:|$)/.test(script)) return 'e2e scripts start or clobber the stack; run flows only via `npm test` in e2e/ against a running stack.';
  return `npm ${args.join(' ')} is not allowed here (reviewer-core: run typecheck, test; e2e: test) (cwd: ${pkg}).`;
}

/** Split masked text into simple-command ranges; separators: && || ; | newline. Lone & → null. */
function splitRanges(masked) {
  const ranges = [];
  let start = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '&') {
      if (masked[i + 1] !== '&') return null;
      ranges.push([start, i]); i++; start = i + 1; continue;
    }
    if (c === '|') {
      ranges.push([start, i]);
      if (masked[i + 1] === '|') i++;
      start = i + 1;
      continue;
    }
    if (c === ';' || c === '\n') { ranges.push([start, i]); start = i + 1; }
  }
  ranges.push([start, masked.length]);
  return ranges;
}

/** Bash check: allowlist of read-only and test commands, each simple command on its own. */
export function checkBash(command, cwd = ROOT) {
  const text = String(command);
  const unsafe = unsafeShellChar(text);
  if (unsafe) {
    return `\`${unsafe.char}\` would be expanded or un-escaped by the shell after this check (escapes, braces, globs, $, ~); spell words out literally.`;
  }
  const maskedRaw = maskQuoted(text);
  if (maskedRaw === null) return 'unterminated quote; not allowed.';
  // Harmless fd plumbing (`2>&1`, `>/dev/null`) is blanked in both copies, keeping offsets aligned.
  const SAFE = /\d*>&\d+|&>\s*\/dev\/null|\d*>>?\s*\/dev\/null/g;
  let masked = maskedRaw;
  let orig = text;
  for (const m of maskedRaw.matchAll(SAFE)) {
    const blank = ' '.repeat(m[0].length);
    masked = masked.slice(0, m.index) + blank + masked.slice(m.index + m[0].length);
    orig = orig.slice(0, m.index) + blank + orig.slice(m.index + m[0].length);
  }
  if (/<<|<\(|>\(/.test(masked)) return 'heredocs and process substitution can feed scripts past this guard; write files with Write/Edit.';
  if (/[<>]/.test(masked)) return 'redirects are not allowed for the test-writer; write test files with Write/Edit.';
  if (/`|\$/.test(masked)) return 'command substitution and $variables are not allowed; spell commands and paths out.';
  if (/[()]/.test(masked)) return 'subshells / grouping are not allowed; run commands one by one.';
  if (envPrefixes(masked).length > 0) return `environment assignments (${envPrefixes(masked).join(', ')}) change what commands do; not allowed.`;
  if (hasDynamicCommand(masked)) return 'a variable or substitution in command position hides what runs.';
  const ranges = splitRanges(masked);
  if (ranges === null) return 'background jobs (&) are not allowed.';

  let dir = cwd;
  for (const [a, b] of ranges) {
    const toks = tokenize(orig.slice(a, b));
    if (toks.length === 0) continue;
    const [{ word: cmd, raw: rawCmd }, ...restToks] = toks;
    const args = restToks.map((t) => t.word);
    if (rawCmd !== cmd || cmd.includes('/') || /^\w+=/.test(cmd)) {
      return `${rawCmd}: run allowlisted commands by their bare name (no paths, quotes or assignments).`;
    }
    let reason = null;
    if (cmd === 'cd') {
      const t = args[0];
      if (args.length !== 1 || !t || t === '-' || t.startsWith('~') || GLOB_OR_ESCAPE.test(t)) return 'cd needs exactly one literal path inside the repository.';
      const next = resolve(dir, t);
      if (!insideRoot(next)) return `cd ${t}: outside the repository.`;
      dir = next;
      continue;
    }
    if (cmd === 'git') reason = checkGit(args, dir);
    else if (FILE_READERS.has(cmd)) {
      for (const w of args) {
        if (w.startsWith('-')) continue;
        reason = checkRepoPath(cmd, w, dir);
        if (reason) break;
      }
    } else if (cmd === 'pnpm') reason = checkPnpm(args, dir);
    else if (cmd === 'npm') reason = checkNpm(args, dir);
    else {
      const wrapped = wrapperReason([cmd, ...args]);
      reason = wrapped || `${cmd} is not on the test-writer allowlist (cd, read-only git, ls, cat, head, tail, wc, pnpm/npm test|typecheck|lint:arch, vitest, eslint) — write test files with Write/Edit.`;
    }
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
