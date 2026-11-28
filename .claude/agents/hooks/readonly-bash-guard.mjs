#!/usr/bin/env node
// PreToolUse guard for the read-only reviewers `architecture-reviewer` and `plan-verifier`
// (.claude/agents/*.md, matcher "Bash|Read|Grep").
// stdin = PreToolUse JSON ({ tool_name, tool_input, cwd }); exit 2 + stderr reason blocks the call.
// Bash is an ALLOWLIST: every simple command must be a known read-only command, run in the package
// directory it belongs to. Anything unknown is blocked. Unparsable stdin is blocked (fail closed).
// Read: secret files (.env*, ~/.devdigest/**) are blocked; other paths, also outside the repo, pass.
// Grep: only paths inside the repo, and no glob that could reach secrets.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { envPrefixes, gitSubcommand, hasDynamicCommand, segments, unsafeShellChar, wrapperReason } from './shell-segments.mjs';
import { eslintArgsReason, gitArgsReason, testScriptArgsReason, vitestArgsReason } from './tool-flags.mjs';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const GIT_ALLOWED = new Set(['diff', 'log', 'show', 'status', 'ls-files', 'rev-parse', 'grep', 'blame']);
const FILE_READERS = new Set(['ls', 'cat', 'head', 'tail', 'wc']);
// git flags: exact-spelling allowlist per subcommand (tool-flags.mjs#gitArgsReason) — git accepts
// abbreviations (`--untrac`, `--conte=`, `--open=`), so a denylist of full names is bypassable.
const PNPM_GLOBAL_BANNED = /^(-C|--dir(=.*)?|--filter(=.*)?|-F|-r|--recursive|-w|--workspace-root)$/;
// git subcommands whose positional args may name files: every path-like arg is checked, not only
// pathspecs after `--` — `git diff /dev/null server/.env` silently switches to --no-index mode.
const GIT_PATH_SUBS = new Set(['diff', 'log', 'show', 'grep', 'blame']);
const DEPCRUISE_OUTPUT_TYPES = new Set(['err', 'err-long', 'text']);

function relToRoot(abs) {
  return relative(ROOT, abs).split(sep).join('/');
}

function insideRoot(abs) {
  const rel = relative(ROOT, abs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Shell quote removal: `server/'.env'` and `"server/.env"` both name server/.env. */
const unquote = (a) => String(a).replace(/['"]/g, '');
/** Glob / brace / escape characters: the shell would expand them into names we never saw. */
const GLOB_CHARS = /[*?[\]{}\\]/;
const expandHome = (p) => (p === '~' || p.startsWith('~/') ? homedir() + p.slice(1) : p);

/** Secret file check shared by Bash readers, git path args and the Read / Grep tools. */
function secretReason(p) {
  // Case-insensitive: APFS resolves ~/.DEVDIGEST and server/.ENV to the real files.
  const norm = expandHome(unquote(p)).split(sep).join('/').toLowerCase();
  if (/(^|\/)\.devdigest(\/|$)/.test(norm)) {
    return `${p} is inside ~/.devdigest (API keys, secrets.json); reviewers never read it.`;
  }
  const base = norm.replace(/\/+$/, '').split('/').pop();
  if (/^\.env(\..*)?$/i.test(base) && base.toLowerCase() !== '.env.example') {
    return `${p} is a secrets file (.env*); reviewers never read it.`;
  }
  if (/(^|\/)\.devdigest\/secrets\.json$/.test(norm) || /\.devdigest\/secrets/.test(norm) || /(^|\/)secrets\.json$/.test(norm) && /devdigest/.test(norm)) {
    return `${p} holds API keys (~/.devdigest/secrets.json); reviewers never read it.`;
  }
  return null;
}

/** Read path check. Paths outside the repo stay allowed (tool-result files); secrets do not. */
export function checkReadPath(filePath) {
  if (filePath === undefined || filePath === null || filePath === '') return null;
  const s = secretReason(filePath);
  if (s) return s;
  // A relative path resolves against the project dir; re-check the absolute form (e.g. ../../.devdigest).
  return secretReason(resolve(ROOT, expandHome(String(filePath))));
}

/** Glob that could match a secrets file: names .env / secrets / .devdigest, or `.e*` / `.en?`-style. */
function secretGlob(glob) {
  const g = String(glob);
  if (/^(\*\*\/)?\.env\.example$/i.test(g)) return false;
  if (/secrets|\.devdigest/i.test(g)) return true;
  if (/\.env/i.test(g)) return true;
  // `.e*`, `.en?`, `.[e]nv`, `{.env,x}` at the start of a path segment
  return /(^|\/|\{|,)\.(e|\[|\*|\?)/i.test(g) || /\.en[*?[]/i.test(g);
}

/** Grep tool check: only inside the repo (or no path = project dir); no secrets-reaching glob. */
export function checkGrep(ti = {}) {
  if (ti.path !== undefined && ti.path !== null && ti.path !== '') {
    const raw = String(ti.path);
    const abs = resolve(ROOT, expandHome(unquote(raw)));
    if (!insideRoot(abs)) return `Grep path ${raw} is outside the repository; reviewers search only the repo.`;
    const s = checkReadPath(raw);
    if (s) return s;
  }
  if (ti.glob && secretGlob(ti.glob)) return `glob ${ti.glob} could match secrets files (.env*, secrets.json, .devdigest).`;
  return null;
}

function pkgOf(dir) {
  const rel = relToRoot(dir);
  return rel === '' ? '.' : rel;
}

function checkFileArgs(cmd, args, dir) {
  for (const raw of args) {
    if (raw.startsWith('-')) continue;
    if (GLOB_CHARS.test(raw)) return `${cmd} ${raw}: glob / brace / escape characters are not allowed; name files exactly.`;
    const a = unquote(raw);
    if (a.startsWith('~') || a.startsWith('$')) return `${cmd} ${a}: only paths inside the repository are allowed.`;
    const abs = resolve(dir, a);
    if (!insideRoot(abs)) return `${cmd} ${a}: path is outside the repository.`;
    const s = secretReason(a);
    if (s) return s;
  }
  return null;
}

function checkGit(words, dir) {
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (w === '-c' || w.startsWith('--config-env') || w.startsWith('--exec-path')) {
      return 'git -c / --config-env / --exec-path can run arbitrary programs; not allowed.';
    }
    if (/^--(git-dir|work-tree|namespace|super-prefix)(=|$)/.test(w)) {
      return `git ${w.split('=')[0]} points git at another repository / tree; not allowed.`;
    }
    if (w === '-C') {
      const target = words[i + 1];
      if (!target || !insideRoot(resolve(dir, target))) return 'git -C must point inside the repository.';
      i++;
      continue;
    }
    if (!w.startsWith('-')) break;
  }
  const sub = gitSubcommand(words);
  if (!sub || !GIT_ALLOWED.has(sub)) {
    return `git ${sub ?? ''} is not read-only; allowed: ${[...GIT_ALLOWED].join(', ')}.`;
  }
  const flagReason = gitArgsReason(sub, words.slice(words.indexOf(sub) + 1));
  if (flagReason) return flagReason;
  // Pathspecs after `--` must stay inside the repo and never name a secrets file.
  const dd = words.indexOf('--');
  if (dd !== -1) {
    for (const raw of words.slice(dd + 1)) {
      const a = unquote(raw);
      if (a.startsWith(':')) continue; // git pathspec magic, e.g. ':!*.lock'
      const s = secretReason(a);
      if (s) return s;
      if (a.startsWith('~') || !insideRoot(resolve(dir, a))) return `git ${sub} -- ${a}: path is outside the repository.`;
    }
  }
  if (GIT_PATH_SUBS.has(sub)) {
    // Every positional arg before `--` too: a path outside the work tree (or /dev/null) makes
    // git diff fall back to --no-index and print any file, .env included.
    const subAt = words.indexOf(sub);
    const before = words.slice(subAt + 1, dd === -1 ? words.length : dd);
    for (const raw of before) {
      if (raw.startsWith('-')) continue;
      const a = unquote(raw);
      if (a.startsWith(':')) continue;
      if (a === '/dev/null') return `git ${sub} /dev/null switches to --no-index (reads any file); not allowed.`;
      const s = secretReason(a);
      if (s) return s;
      if (a.startsWith('~')) return `git ${sub} ${a}: path is outside the repository.`;
      const abs = resolve(dir, a);
      // A revision (HEAD~1, origin/main...HEAD, HEAD^) is not a file; anything that exists on disk,
      // is absolute or starts with `.` is treated as a path and must stay inside the repo.
      const pathLike = existsSync(abs) || isAbsolute(a) || a.startsWith('.');
      if (pathLike && !insideRoot(abs)) return `git ${sub} ${a}: path is outside the repository.`;
    }
  }
  return null;
}

/** depcruise: read-only report flags only (`--config`, `--output-type err|err-long|text`, `--no-cache`). */
function depcruiseArgsReason(args) {
  for (let i = 0; i < args.length; i++) {
    const a = unquote(args[i]);
    if (!a.startsWith('-')) continue;
    const [name, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    if (name === '--no-cache' && inline === undefined) continue;
    if (name === '--config' || name === '--output-type' || name === '-T') {
      const v = inline ?? unquote(args[++i] ?? '');
      if (!v) return `depcruise ${name} needs a value.`;
      if (name !== '--config' && !DEPCRUISE_OUTPUT_TYPES.has(v)) return `depcruise ${name} ${v}: only err, err-long, text.`;
      // depcruise EVALUATES the config file as JavaScript: only the repo's own config may be named.
      if (name === '--config' && !['.dependency-cruiser.cjs', './.dependency-cruiser.cjs'].includes(v)) {
        return `depcruise --config ${v}: only the repo's .dependency-cruiser.cjs (the config file is executed).`;
      }
      continue;
    }
    return `depcruise flag ${a} is not on the allowlist (--config, --output-type err|err-long|text, --no-cache).`;
  }
  return null;
}

function checkPnpm(args, dir) {
  if (args.some((a) => /lint:arch:baseline/.test(a))) {
    return 'lint:arch:baseline rewrites the known-violations baseline and hides new violations; never allowed.';
  }
  const globalBad = args.find((a) => PNPM_GLOBAL_BANNED.test(a));
  if (globalBad) return `pnpm ${globalBad} changes the target package; cd into the package instead.`;
  const pkg = pkgOf(dir);
  const rest = args[0] === 'run' ? args.slice(1) : args;
  const [script, ...more] = rest;
  if (script === 'typecheck' && more.length === 0) {
    return pkg === 'server' || pkg === 'client' ? null : `pnpm typecheck runs only in server/ or client/ (cwd: ${pkg}).`;
  }
  if (script === 'lint:arch' && more.length === 0) {
    return pkg === 'server' ? null : `pnpm lint:arch runs only in server/ (cwd: ${pkg}).`;
  }
  if (script === 'test') {
    if (pkg !== 'server' && pkg !== 'client') return `pnpm test runs only in server/ or client/ (cwd: ${pkg}).`;
    return testScriptArgsReason(more);
  }
  // shell-segments drops the word `exec`, so `pnpm exec vitest` arrives as `pnpm vitest`
  // (pnpm runs a package bin the same way in both forms).
  const execArgs = args[0] === 'exec' ? args.slice(1) : args;
  if (['vitest', 'eslint', 'depcruise'].includes(execArgs[0]) || args[0] === 'exec') {
    const [tool, ...targs] = execArgs;
    if (tool === 'vitest') {
      if (pkg !== 'server' && pkg !== 'client') return `vitest runs only in server/ or client/ (cwd: ${pkg}).`;
      return vitestArgsReason(targs);
    }
    if (tool === 'eslint') {
      if (pkg !== 'client') return `eslint runs only in client/ (cwd: ${pkg}).`;
      return eslintArgsReason(targs);
    }
    if (tool === 'depcruise') {
      if (pkg !== 'server') return `depcruise runs only in server/ (cwd: ${pkg}).`;
      return depcruiseArgsReason(targs);
    }
    return `pnpm exec ${tool ?? ''} is not on the read-only allowlist (vitest, eslint, depcruise).`;
  }
  return `pnpm ${args.join(' ')} is not on the read-only allowlist (typecheck, lint:arch, test, exec vitest|eslint|depcruise).`;
}

function checkNpm(args, dir) {
  const pkg = pkgOf(dir);
  if (pkg !== 'reviewer-core') return `npm runs only in reviewer-core/ (cwd: ${pkg}); server and client use pnpm.`;
  const sep2 = args.indexOf('--');
  const head = sep2 === -1 ? args : args.slice(0, sep2);
  const tail = sep2 === -1 ? [] : args.slice(sep2 + 1);
  const cmd = head.join(' ');
  if (cmd === 'run typecheck' && tail.length === 0) return null;
  if (cmd === 'test' || cmd === 'run test') return testScriptArgsReason(tail);
  return `npm ${args.join(' ')} is not on the read-only allowlist (run typecheck, test).`;
}

function checkNode(args, dir) {
  if (args[0] !== '--test') return 'node is allowed only as `node --test .claude/agents/hooks/…`.';
  const paths = args.slice(1);
  if (paths.length === 0) return 'node --test needs an explicit path under .claude/agents/hooks/.';
  for (const raw of paths) {
    const p = raw.replace(/^['"]|['"]$/g, '');
    if (p.startsWith('-')) return `node --test ${p}: flags are not allowed.`;
    const rel = relToRoot(resolve(dir, p));
    if (!rel.startsWith('.claude/agents/hooks/')) {
      return `node --test ${p}: only tests under .claude/agents/hooks/ are allowed.`;
    }
    // A directory arg makes node 26 also run the guard modules, whose main() waits on stdin forever.
    if (!/\.test\.mjs$/.test(p)) {
      return `node --test ${p}: pass *.test.mjs files (e.g. '.claude/agents/hooks/*.test.mjs'), not a directory or a guard module.`;
    }
  }
  return null;
}

const MASK = '\u0001';

/**
 * Neutralise shell metacharacters inside quotes so a quoted `|`, `>` or `;` (a regex, an arrow in a
 * --grep pattern) is not read as a pipe or a redirect. Single quotes: everything is literal.
 * Double quotes: `$(` and backticks still execute in a real shell, so they are kept and blocked later.
 * An unterminated quote returns null (fail closed).
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
    // Inside "…", `$(` must survive intact so the command-substitution check still sees it.
    const keepParen = quote === '"' && c === '(' && text[i - 1] === '$';
    const meta = quote === "'" ? /[|;&<>()`$\n]/ : /[|;&<>()\n]/;
    out += meta.test(c) && !keepParen ? MASK : c;
  }
  return quote === null ? out : null;
}

export function checkReadonlyBash(command, cwd = ROOT) {
  // First: anything the shell would expand or un-escape after this check (`--out\put`, `{a,b}`,
  // globs, `$`, a leading `~`) — the words approved below must be exactly the words the shell runs.
  const unsafe = unsafeShellChar(String(command));
  if (unsafe) {
    return unsafe.char === 'unterminated quote'
      ? 'unterminated quote; not allowed.'
      : `\`${unsafe.char}\` would be expanded / un-escaped by the shell; name commands, flags and files literally (quote patterns with '…').`;
  }
  const text = maskQuoted(String(command));
  if (text === null) return 'unterminated quote; not allowed.';
  // Harmless stderr/stdout plumbing is removed before the redirection check.
  const stripped = text
    .replace(/\d*>&\d/g, ' ')
    .replace(/&>\s*\/dev\/null/g, ' ')
    .replace(/\d*>\s*\/dev\/null/g, ' ');
  if (/[<>]/.test(stripped)) return 'redirection / heredoc / process substitution writes or reads files; not allowed.';
  if (/`|\$\(/.test(stripped)) return 'command substitution is not allowed.';
  if (/&/.test(stripped.replace(/&&/g, ' '))) return 'background jobs (&) are not allowed.';
  // VAR=x prefixes change what an allowed command runs (GIT_EXTERNAL_DIFF=rm git diff, GIT_CONFIG_*).
  const env = envPrefixes(stripped);
  if (env.length > 0) return `environment assignments (${env.join(', ')}) change what the command runs; not allowed.`;
  if (hasDynamicCommand(stripped)) return 'a command word built from $… or backticks is not allowed.';
  // The raw command word must be a bare name: `/usr/bin/git`, `"git"` or `\git` could be any binary.
  for (const seg of stripped.split(/\$\(|[;&|()\n`]/)) {
    const word = seg.trim().split(/\s+/)[0];
    if (word && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(word)) {
      return `command word ${word} must be a bare allowlisted name (no path, quotes or escapes).`;
    }
  }

  let dir = cwd;
  for (const words of segments(stripped)) {
    const [cmd, ...args] = words;
    const wrapped = wrapperReason(words);
    if (wrapped) return wrapped;
    if (cmd === 'cd') {
      if (!args[0] || args[0].startsWith('~') || args[0].startsWith('$')) return 'cd needs an explicit path inside the repository.';
      const next = resolve(dir, args[0]);
      if (!insideRoot(next)) return `cd ${args[0]}: outside the repository.`;
      dir = next;
      continue;
    }
    let reason;
    if (cmd === 'git') reason = checkGit(words, dir);
    else if (FILE_READERS.has(cmd)) reason = checkFileArgs(cmd, args, dir);
    else if (cmd === 'pnpm') reason = checkPnpm(args, dir);
    else if (cmd === 'npm') reason = checkNpm(args, dir);
    else if (cmd === 'node') reason = checkNode(args, dir);
    else reason = `${cmd} is not on the read-only allowlist (cd, git diff|log|show|status|ls-files|rev-parse|grep|blame, ls, cat, head, tail, wc, pnpm, npm, node --test).`;
    if (reason) return reason;
  }
  return null;
}

export async function main() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    process.stderr.write('readonly-bash-guard: blocked — unparsable hook input.\n');
    return 2;
  }
  if (!input || typeof input !== 'object') {
    process.stderr.write('readonly-bash-guard: blocked — unparsable hook input.\n');
    return 2;
  }
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  let reason = null;
  if (tool === 'Bash') reason = checkReadonlyBash(String(ti.command ?? ''), input.cwd || ROOT);
  else if (tool === 'Read') reason = checkReadPath(ti.file_path);
  else if (tool === 'Grep') reason = checkGrep(ti);
  if (reason) {
    process.stderr.write(`readonly-bash-guard: blocked — ${reason}\n`);
    return 2;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
