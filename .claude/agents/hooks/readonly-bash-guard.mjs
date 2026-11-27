#!/usr/bin/env node
// PreToolUse guard for the read-only reviewers `architecture-reviewer` and `plan-verifier`
// (.claude/agents/*.md, matcher "Bash|Read|Grep").
// stdin = PreToolUse JSON ({ tool_name, tool_input, cwd }); exit 2 + stderr reason blocks the call.
// Bash is an ALLOWLIST: every simple command must be a known read-only command, run in the package
// directory it belongs to. Anything unknown is blocked. Unparsable stdin is blocked (fail closed).
// Read / Grep: secret files (.env*, ~/.devdigest/secrets.json) are blocked; everything else passes.
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { gitSubcommand, segments } from './shell-segments.mjs';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const GIT_ALLOWED = new Set(['diff', 'log', 'show', 'status', 'ls-files', 'rev-parse', 'grep', 'blame']);
const FILE_READERS = new Set(['ls', 'cat', 'head', 'tail', 'wc']);
const PNPM_GLOBAL_BANNED = /^(-C|--dir(=.*)?|--filter(=.*)?|-F|-r|--recursive|-w|--workspace-root)$/;
const VITEST_BANNED = /^(-u|--update(=.*)?|--coverage(\..*)?(=.*)?|--outputFile(\..*)?(=.*)?|--watch(=.*)?|-w|--ui(=.*)?|--standalone)$/;
const ESLINT_BANNED = /^(--fix(-.*)?(=.*)?|-o|--output-file(=.*)?|--cache(-.*)?(=.*)?|--init)$/;
const DEPCRUISE_BANNED = /^(--init(=.*)?|--output-to(=.*)?|-f|--cache(-.*)?(=.*)?)$/;

function relToRoot(abs) {
  return relative(ROOT, abs).split(sep).join('/');
}

function insideRoot(abs) {
  const rel = relative(ROOT, abs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Secret file check shared by Bash readers and the Read / Grep tools. */
function secretReason(p) {
  const norm = String(p).split(sep).join('/');
  const base = norm.split('/').pop();
  if (/^\.env(\..*)?$/i.test(base) && base.toLowerCase() !== '.env.example') {
    return `${p} is a secrets file (.env*); reviewers never read it.`;
  }
  if (/(^|\/)\.devdigest\/secrets\.json$/.test(norm) || /\.devdigest\/secrets/.test(norm)) {
    return `${p} holds API keys (~/.devdigest/secrets.json); reviewers never read it.`;
  }
  return null;
}

/** Read / Grep path check. */
export function checkReadPath(filePath) {
  if (filePath === undefined || filePath === null || filePath === '') return null;
  return secretReason(filePath);
}

function pkgOf(dir) {
  const rel = relToRoot(dir);
  return rel === '' ? '.' : rel;
}

function checkFileArgs(cmd, args, dir) {
  for (const a of args) {
    if (a.startsWith('-')) continue;
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
  for (const w of words) {
    if (w === '--output' || w.startsWith('--output=') || w === '--ext-diff' || w === '--no-index') {
      return `git ${w} writes files or reads outside the repository; not allowed.`;
    }
    if (sub === 'grep' && (/^-O/.test(w) || w.startsWith('--open-files-in-pager'))) {
      return `git grep ${w} runs a pager program; not allowed.`;
    }
  }
  return null;
}

function checkVitestArgs(args) {
  const bad = args.find((a) => VITEST_BANNED.test(a));
  return bad ? `vitest ${bad} writes files or never exits; not allowed.` : null;
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
    return checkVitestArgs(more);
  }
  // shell-segments drops the word `exec`, so `pnpm exec vitest` arrives as `pnpm vitest`
  // (pnpm runs a package bin the same way in both forms).
  const execArgs = args[0] === 'exec' ? args.slice(1) : args;
  if (['vitest', 'eslint', 'depcruise'].includes(execArgs[0]) || args[0] === 'exec') {
    const [tool, ...targs] = execArgs;
    if (tool === 'vitest') {
      if (pkg !== 'server' && pkg !== 'client') return `vitest runs only in server/ or client/ (cwd: ${pkg}).`;
      if (targs[0] === 'related' && !targs.includes('--run')) return 'vitest related without --run starts watch mode; add --run.';
      if (targs[0] !== 'related' && targs[0] !== 'run') return 'only `vitest run …` and `vitest related --run …` are allowed.';
      return checkVitestArgs(targs);
    }
    if (tool === 'eslint') {
      if (pkg !== 'client') return `eslint runs only in client/ (cwd: ${pkg}).`;
      const bad = targs.find((a) => ESLINT_BANNED.test(a));
      return bad ? `eslint ${bad} writes files; not allowed.` : null;
    }
    if (tool === 'depcruise') {
      if (pkg !== 'server') return `depcruise runs only in server/ (cwd: ${pkg}).`;
      const bad = targs.find((a) => DEPCRUISE_BANNED.test(a));
      return bad ? `depcruise ${bad} writes files; not allowed.` : null;
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
  if (cmd === 'test' || cmd === 'run test') return checkVitestArgs(tail);
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

  let dir = cwd;
  for (const words of segments(stripped)) {
    const [cmd, ...args] = words;
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
  else if (tool === 'Grep') {
    reason = checkReadPath(ti.path);
    if (!reason && ti.glob && /\.env(?!\.example)/i.test(String(ti.glob))) reason = `glob ${ti.glob} targets secrets files.`;
  }
  if (reason) {
    process.stderr.write(`readonly-bash-guard: blocked — ${reason}\n`);
    return 2;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
