#!/usr/bin/env node
// PreToolUse guard for the `implementer` subagent (.claude/agents/implementer.md).
// stdin = PreToolUse JSON ({ tool_name, tool_input, cwd }); exit 2 + stderr reason blocks the call.
// Commands are matched only in command position (after ; & | ( newline or $( ), never as substrings,
// so text that merely mentions `git push` inside an echo or heredoc body is not blocked by accident.
// The implementer may write source, so Bash writes are checked only against the protected paths of
// checkPath (redirect targets and the targets of sed -i / cp / mv / tee / touch / ln / rm / dd …).
// Wrappers that hide a command (bash -c, xargs, timeout, eval, find -exec …) are blocked outright.
// Unparsable stdin is blocked (fail closed).
//
// This is a TRIPWIRE, not a sandbox. The implementer legitimately writes source and runs scripts, so
// Bash is a denylist: git writes, gh, wrappers, dangerous env prefixes and writes into protected paths
// are caught, but a script run via node / python / tsx can still write anywhere or call git / gh.
// Real isolation comes from Claude Code's sandbox / permission settings, not from this hook.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { commandName, envPrefixes, hasDynamicCommand, realTarget, segments, wrapperReason } from './shell-segments.mjs';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// git subcommands that change history, refs, the index wholesale or config — the main session owns them.
const GIT_BLOCKED = new Set([
  'commit', 'push', 'reset', 'checkout', 'switch', 'stash', 'rebase', 'merge', 'clean', 'restore',
  'cherry-pick', 'revert', 'tag', 'update-ref', 'symbolic-ref', 'filter-branch', 'filter-repo', 'replace',
  'notes', 'worktree', 'am', 'apply', 'gc', 'prune', 'repack', 'init', 'clone', 'submodule', 'bisect',
  'pull', 'checkout-index', 'read-tree', 'update-index', 'commit-tree', 'write-tree', 'fast-import',
]);
// Everything else must be on this list: an unknown subcommand may be an alias for a blocked one.
const GIT_ALLOWED = new Set([
  'status', 'diff', 'log', 'show', 'add', 'ls-files', 'rev-parse', 'grep', 'blame', 'branch', 'fetch',
  'mv', 'rm', 'config', 'describe', 'shortlog', 'ls-tree', 'cat-file', 'rev-list', 'merge-base', 'remote',
  'reflog', 'help', 'version', 'check-ignore', 'diff-tree', 'diff-files', 'diff-index', 'name-rev',
  'for-each-ref', 'show-ref', 'count-objects', 'range-diff', 'whatchanged', 'archive',
]);
// git global options that point git at another repo/config or run programs.
const GIT_GLOBAL_BANNED = /^(-c|--config-env|--exec-path|--git-dir|--work-tree|--namespace|--super-prefix|--attr-source)(=|$)/;
// Environment prefixes that change what a command runs (GIT_EXTERNAL_DIFF, GIT_CONFIG_*, LD_PRELOAD …).
const ENV_BANNED = (name) => /^(GIT_|LD_|DYLD_)/.test(name) || ['NODE_OPTIONS', 'BASH_ENV', 'ENV', 'PATH', 'ZDOTDIR', 'SHELLOPTS'].includes(name);
// Shell reserved words that can precede a command (`if x; then git push; fi`, `{ git push; }`).
const RESERVED = new Set(['{', '}', '!', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'function', 'coproc', 'time']);
// Wrappers not in shell-segments' WRAPPERS that also run a command given as an argument.
const EXTRA_WRAPPERS = new Set([
  'stdbuf', 'chroot', 'caffeinate', 'flock', 'setsid', 'arch', 'unbuffer', 'ionice', 'taskset', 'chrt',
  'sg', 'runuser', 'systemd-run', 'launchctl', 'at', 'batch', 'crontab', 'nsenter', 'unshare', 'expect',
  'alias', 'trap', 'patch',
]);
// Folders an archive / sync must not be unpacked into: they contain or are protected paths.
const PROTECTED_DIRS = ['.claude', '.git', '.github/workflows', 'client/src/vendor/ui', 'server/src/db/migrations'];
// Runners that execute another binary: `pnpm exec gh`, `npx gh` (segments() already drops `exec`).
const RUNNERS = new Set(['pnpm', 'npm', 'npx', 'pnpx', 'yarn', 'bunx', 'bun', 'corepack']);
// Runner options that take a value in the next word; that word is not the command to run.
const RUNNER_VALUE_OPTS = new Set(['-C', '--dir', '--filter', '-F', '--prefix', '--workspace', '-w', '-p', '--package', '--cwd', '--registry', '--loglevel']);
const SEPARATORS = /\$\(|[;&|()\n`]/;
const DEV_SINKS = new Set(['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty']);

const unquote = (w) => w.replace(/^['"]|['"]$/g, '');

/**
 * git accepts any unambiguous PREFIX of a long option (`--open=` = `--open-files-in-pager=`,
 * `--git-d` = `--git-dir`). Returns the banned option `word` abbreviates (name ≥ 4 chars incl. `--`),
 * or null. Quotes are stripped first (`'--git-d=x'` is the same word to the shell).
 */
function abbreviates(word, banned) {
  const w = word.replace(/['"]/g, '');
  if (!w.startsWith('--')) return null;
  const name = w.split('=')[0];
  if (name.length < 4) return null;
  return banned.find((b) => b.startsWith(name)) ?? null;
}

const GIT_GLOBAL_LONG_BANNED = ['--config-env', '--exec-path', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--attr-source'];
const GIT_PROGRAM_OPTS = ['--upload-pack', '--receive-pack', '--exec', '--open-files-in-pager', '--ext-diff', '--textconv'];
const nonFlags = (args) => args.filter((a) => !a.startsWith('-'));

/** Drop fd plumbing (`2>&1`, `>&2`) and turn `&>` / `&>>` into a plain redirect before splitting. */
function normalize(command) {
  return command.replace(/\d*>&\d+/g, ' ').replace(/&>>?/g, '>');
}

/** Redirect targets in one raw segment, plus the segment with the redirects removed. */
function redirects(raw) {
  const targets = [];
  const rest = raw.replace(/\d*>>?\|?\s*(\S+)/g, (_, t) => {
    targets.push(unquote(t));
    return ' ';
  });
  return { targets, rest };
}

/**
 * Values of options in getopt style: short letters (`-o x`, `-ox`, `-sSo x`) and long names
 * (`--output x`, `--output=x`).
 */
function flagValues(args, letters, longs) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [name, value] = a.split(/=(.*)/s);
      if (longs.includes(name)) out.push(value !== undefined ? value : args[++i]);
      continue;
    }
    if (/^-[a-zA-Z]/.test(a)) {
      const bundle = a.slice(1);
      for (const l of letters) {
        const at = bundle.indexOf(l);
        if (at < 0) continue;
        const rest = bundle.slice(at + 1);
        out.push(rest || args[++i]);
        break;
      }
    }
  }
  return out.filter((v) => v !== undefined);
}

const urlName = (u) => basename(u.replace(/[?#].*$/, '').replace(/\/+$/, '')) || 'index.html';
const urls = (args) => args.filter((a) => /^[a-z][\w+.-]*:\/\//i.test(a));

/** Folders a command unpacks / syncs into (each checked with checkDestDir). */
function destDirs(cmd, args) {
  const plain = args.map(unquote);
  switch (cmd) {
    case 'tar': {
      const first = plain[0] && /^[a-zA-Z]+$/.test(plain[0]) ? [`-${plain[0]}`, ...plain.slice(1)] : plain;
      const extract = first.some((a) => /^-[a-zA-Z]*x/.test(a) || a === '--extract' || a === '--get');
      if (!extract) return [];
      const c = flagValues(first, ['C'], ['--directory']);
      return c.length ? c : ['.'];
    }
    case 'unzip': {
      const d = flagValues(plain, ['d'], []);
      return d.length ? d : ['.'];
    }
    case 'rsync': {
      const files = nonFlags(plain);
      const dst = files[files.length - 1];
      return files.length >= 2 && !/^[\w.@-]+:(?!\/\/)/.test(dst) ? [dst] : [];
    }
    case 'wget':
      return plain.some((a) => /^-[a-zA-Z]*[rm]$/.test(a) || a === '--recursive' || a === '--mirror')
        ? (flagValues(plain, ['P'], ['--directory-prefix']).length ? flagValues(plain, ['P'], ['--directory-prefix']) : ['.'])
        : [];
    default:
      return [];
  }
}

/** Files a simple command writes to (best effort; only used to protect checkPath's paths). */
function writeTargets(cmd, args) {
  const plain = args.map(unquote);
  switch (cmd) {
    case 'curl': {
      const out = flagValues(plain, ['o'], ['--output']);
      if (plain.some((a) => /^-[a-zA-Z]*O$/.test(a) || a === '--remote-name' || a === '--remote-name-all')) {
        out.push(...urls(plain).map(urlName));
      }
      return out;
    }
    case 'wget': {
      const o = flagValues(plain, ['O'], ['--output-document']);
      if (o.length) return o.filter((v) => v !== '-');
      const prefix = flagValues(plain, ['P'], ['--directory-prefix'])[0];
      return urls(plain).map((u) => (prefix ? join(prefix, urlName(u)) : urlName(u)));
    }
    case 'sort':
      return flagValues(plain, ['o'], ['--output']);
    case 'tar': {
      const first = plain[0] && /^[a-zA-Z]+$/.test(plain[0]) ? [`-${plain[0]}`, ...plain.slice(1)] : plain;
      const create = first.some((a) => /^-[a-zA-Z]*[cru]/.test(a) || ['--create', '--append', '--update'].includes(a));
      return create ? flagValues(first, ['f'], ['--file']) : [];
    }
    case 'split': {
      const files = nonFlags(plain);
      return [files.length >= 2 ? files[files.length - 1] : 'x'];
    }
    case 'awk':
    case 'gawk': {
      const inplace = plain.some((a, i) => a === '-iinplace' || a === '--include=inplace'
        || ((a === '-i' || a === '--include') && plain[i + 1] === 'inplace'));
      if (!inplace) return [];
      const out = [];
      let programSeen = plain.some((a) => a === '-f' || a.startsWith('--file'));
      for (let i = 0; i < plain.length; i++) {
        const a = plain[i];
        if (['-f', '-v', '-F', '-i', '--include', '--file'].includes(a)) { i++; continue; }
        if (a.startsWith('-')) continue;
        if (!programSeen) { programSeen = true; continue; }
        out.push(a);
      }
      return out;
    }
    case 'sed':
      return plain.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place')) ? nonFlags(plain) : [];
    case 'perl':
      return plain.some((a) => /^-[a-zA-Z]*i/.test(a)) ? nonFlags(plain) : [];
    case 'cp':
    case 'mv':
    case 'install': {
      const out = [];
      const t = plain.findIndex((a) => a === '-t' || a === '--target-directory');
      if (t >= 0 && plain[t + 1]) out.push(plain[t + 1]);
      for (const a of plain) if (a.startsWith('--target-directory=')) out.push(a.split('=')[1]);
      const files = nonFlags(plain);
      if (files.length) out.push(files[files.length - 1]);
      return out;
    }
    case 'ln': {
      const files = nonFlags(plain);
      if (files.length === 0) return [];
      return files.length === 1 ? [files[0].split('/').pop()] : [files[files.length - 1]];
    }
    case 'tee':
    case 'touch':
    case 'truncate':
    case 'rm':
    case 'rmdir':
    case 'unlink':
    case 'chmod':
    case 'chown':
      return nonFlags(plain);
    default:
      return [];
  }
}

/** One glob path segment → RegExp. Like the shell (no dotglob), a leading `*` / `?` / `[` skips dotfiles. */
function segmentRegex(seg) {
  let re = '';
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const end = seg.indexOf(']', i + 1);
      if (end === -1) { re += '\\['; continue; }
      re += `[${seg.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`;
      i = end;
    } else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  // Case-insensitive: APFS resolves `.CLAUDE` to `.claude`.
  return new RegExp(/^[*?[]/.test(seg) ? `^(?!\\.)${re}$` : `^${re}$`, 'i');
}

/**
 * A write target with a glob (`* ? [`) is expanded by the shell, not the guard, so it is matched
 * segment by segment against every protected path: blocked when it could name a protected folder, an
 * ancestor of one (`cp x .c*` copies INTO `.claude`), something inside one (`server/src/db/m*`), a
 * `.env*` file, or anything outside the repo. Shell rules apply: a segment starting with a metachar
 * skips dotfiles, so `rm dist/*.js` and `rm *.log` stay allowed. Escapes and braces are blocked
 * before this (they rewrite the path after the guard looked at it).
 */
function globTargetReason(target, dir) {
  if (!/[*?[]/.test(target)) return null;
  const expanded = target === '~' || target.startsWith('~/') ? homedir() + target.slice(1) : target;
  const rel = relative(ROOT, isAbsolute(expanded) ? resolve(expanded) : resolve(dir, expanded)).split(sep).join('/');
  if (outside(rel)) return `write target ${target}: glob outside the repository.`;
  const segs = rel.split('/').map(segmentRegex);
  for (const p of PROTECTED_DIRS) {
    const ps = p.split('/');
    const n = Math.min(segs.length, ps.length);
    let ok = true;
    for (let i = 0; i < n && ok; i++) ok = segs[i].test(ps[i]);
    if (ok) return `write target ${target}: glob could expand into protected ${p}/.`;
  }
  const last = segs[segs.length - 1];
  if (['.env', '.env.local', '.env.production', '.env.development', '.env.test'].some((f) => last.test(f))) {
    return `write target ${target}: glob could expand to a .env file.`;
  }
  return null;
}

/** checkPath for a shell-level target, resolved against the tracked cd dir. */
function checkTarget(target, dir) {
  if (!target || DEV_SINKS.has(target)) return null;
  if (/[$`]/.test(target)) return `write target ${target} uses a variable / substitution; write to an explicit path.`;
  if (/[\\{}]/.test(target)) return `write target ${target} uses a backslash escape or brace expansion; write to an explicit path.`;
  const glob = globTargetReason(target, dir);
  if (glob) return glob;
  if (/[*?[]/.test(target)) return null; // glob with a safe literal prefix: the shell expands it to ordinary files
  const expanded = target === '~' || target.startsWith('~/') ? homedir() + target.slice(1) : target;
  return checkPath(isAbsolute(expanded) ? expanded : resolve(dir, expanded));
}

/** The command word as typed (before commandName): metachars there mean the shell picks the binary. */
function rawCommandWord(rest) {
  for (const w of rest.trim().split(/\s+/)) {
    if (!w || /^\w+=\S*$/.test(w) || ['command', 'env', 'exec', 'sudo', 'builtin', 'nocorrect', 'noglob'].includes(w) || RESERVED.has(w)) continue;
    return w;
  }
  return null;
}

/** A folder something is unpacked / synced into must not be, or contain, a protected path or a .env file. */
function checkDestDir(target, dir) {
  const r = checkTarget(target, dir);
  if (r) return r;
  const expanded = target === '~' || target.startsWith('~/') ? homedir() + target.slice(1) : target;
  const abs = isAbsolute(expanded) ? expanded : resolve(dir, expanded);
  let rel;
  try {
    rel = relative(realpathSync.native(ROOT), realTarget(abs)).split(sep).join('/');
  } catch {
    return `cannot resolve ${target}.`;
  }
  const prefix = rel === '' ? '' : `${rel}/`;
  const hit = PROTECTED_DIRS.find((p) => `${p}/`.startsWith(prefix.toLowerCase()));
  if (hit) return `${target}: unpacking / syncing into a folder that contains ${hit} is not allowed; use a scratch folder.`;
  try {
    if (existsSync(abs) && readdirSync(abs).some((f) => /^\.env/i.test(f) && f.toLowerCase() !== '.env.example')) {
      return `${target}: folder holds .env files; unpack / sync somewhere else.`;
    }
  } catch {
    return `cannot read ${target}.`;
  }
  return null;
}

/** git: global options, allowlisted subcommands, and the read-only shape of branch / config / remote / reflog. */
function checkGit(words, dir) {
  let i = 1;
  for (; i < words.length; i++) {
    const w = unquote(words[i]);
    if (GIT_GLOBAL_BANNED.test(w)) return `git ${w.split('=')[0]} points git at another repo / config or runs programs; not allowed.`;
    const globalAbbr = abbreviates(w, GIT_GLOBAL_LONG_BANNED);
    if (globalAbbr) return `git ${w.split('=')[0]} (= ${globalAbbr}) points git at another repo / config; not allowed.`;
    if (w === '-C') {
      const target = words[i + 1] && unquote(words[i + 1]);
      if (!target || /[~$`*?[]/.test(target) || !insideRoot(resolve(dir, target))) return 'git -C must point inside the repository.';
      i++;
      continue;
    }
    if (w.startsWith('-')) continue;
    break;
  }
  const sub = words[i] && unquote(words[i]);
  if (!sub) return null;
  const args = words.slice(i + 1).map(unquote);
  if (GIT_BLOCKED.has(sub)) return `git ${sub} is not allowed for the implementer — the main session owns git state.`;
  if (!GIT_ALLOWED.has(sub)) return `git ${sub} is not on the implementer's git allowlist (it may be an alias); ask the main session.`;
  for (const a of args) {
    const prog = abbreviates(a, GIT_PROGRAM_OPTS);
    if (prog) return `git ${sub} ${a.split('=')[0]} (= ${prog}) runs a program; not allowed.`;
    const out = abbreviates(a, ['--output']);
    if (out && a.split('=')[0] !== '--output') return `git ${sub} ${a.split('=')[0]} abbreviates --output; spell the option out so its target can be checked.`;
  }
  for (const t of flagValues(args, [], ['--output'])) {
    const r = checkTarget(t, dir);
    if (r) return r;
  }
  switch (sub) {
    case 'branch': {
      const write = args.find((a) => /^-[a-zA-Z]*[dDmMcCfu]/.test(a) && !/^-(a|r|v|vv|l)$/.test(a)
        || abbreviates(a, ['--delete', '--move', '--copy', '--force', '--set-upstream-to', '--unset-upstream', '--edit-description', '--track', '--no-track']));
      if (write) return `git branch ${write} changes refs; the main session owns git state.`;
      const listing = args.some((a) => ['--list', '-l', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--show-current'].includes(a.split('=')[0]));
      if (nonFlags(args).length && !listing) return 'git branch <name> creates a branch; the main session owns git state.';
      return null;
    }
    case 'config': {
      const writes = ['--add', '--unset', '--unset-all', '--replace-all', '--rename-section', '--remove-section', '--edit', '-e'];
      if (args.some((a) => writes.includes(a) || abbreviates(a, writes.filter((x) => x.startsWith('--'))))) return 'git config writes are not allowed; config changes are the main session\'s.';
      const reads = ['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l'];
      if (args.some((a) => reads.includes(a)) || nonFlags(args).length <= 1) return null;
      return 'git config <key> <value> writes config (and can define aliases); not allowed.';
    }
    case 'remote':
      return args.length === 0 || ['-v', '--verbose', 'show', 'get-url'].includes(args[0])
        ? null : `git remote ${args[0]} changes remotes; not allowed.`;
    case 'reflog':
      return ['expire', 'delete', 'drop'].includes(args[0]) ? `git reflog ${args[0]} rewrites history; not allowed.` : null;
    case 'fetch': {
      const bad = args.find((a) => /^--(upload-pack|receive-pack)/.test(a));
      if (bad) return `git fetch ${bad.split('=')[0]} runs a program; not allowed.`;
      // A refspec with a local destination (`+a:refs/heads/b`, `a:b`) or --update-head-ok moves refs —
      // the same as update-ref / branch -f / reset. Only plain `git fetch [remote] [branch]` passes.
      const refWrite = args.find((a) => a.replace(/['"]/g, '').startsWith('+') || (!a.startsWith('-') && a.includes(':') && !/^[a-z]+:\/\//i.test(a))
        || abbreviates(a, ['--update-head-ok', '--refmap']));
      return refWrite ? `git fetch ${refWrite} writes local refs; the main session owns git state.` : null;
    }
    case 'grep': {
      const bad = args.find((a) => /^-O/.test(a) || a.startsWith('--open-files-in-pager'));
      return bad ? `git grep ${bad} runs a pager program; not allowed.` : null;
    }
    case 'mv': {
      const files = nonFlags(args);
      return files.length ? checkTarget(files[files.length - 1], dir) : null;
    }
    case 'rm':
      for (const f of nonFlags(args)) {
        const r = checkTarget(f, dir);
        if (r) return r;
      }
      return null;
    case 'archive': {
      // -o <file> / -o<file> is the short form of --output (checked above).
      for (let i = 0; i < args.length; i++) {
        const a = args[i].replace(/['"]/g, '');
        const t = a === '-o' ? args[i + 1] : a.startsWith('-o') ? a.slice(2) : null;
        if (t !== null && t !== undefined) {
          const r = checkTarget(t, dir);
          if (r) return r;
        }
      }
      return null;
    }
    default:
      return null;
  }
}

function insideRoot(abs) {
  const rel = relative(ROOT, abs);
  return rel === '' || !outside(rel);
}

export function checkBash(command, cwd = ROOT) {
  let dir = cwd;
  const text = String(command);
  if (hasDynamicCommand(text)) return 'the command word is a variable or substitution ($X, $(…), `…`); run the command directly.';
  const env = envPrefixes(text).find(ENV_BANNED);
  if (env) return `${env}=… changes what git / node / the shell runs; not allowed for the implementer.`;
  const pieces = normalize(text).split(SEPARATORS).map((s) => s.trim()).filter(Boolean);
  for (const raw of pieces) {
    const { targets, rest } = redirects(raw);
    let words = segments(rest)[0];
    const rawCmd = rawCommandWord(rest);
    if (rawCmd && rawCmd !== '[' && rawCmd !== '[[' && /[*?[\]{}\\]/.test(rawCmd)) {
      return `command word ${rawCmd} uses a glob, brace or backslash — the shell would pick the binary; run it by plain name.`;
    }
    for (const t of targets) {
      const r = checkTarget(t, dir);
      if (r) return r;
    }
    if (!words) continue;
    while (words.length && RESERVED.has(words[0])) words = words.slice(1);
    if (!words.length) continue;
    words = [commandName(words[0]), ...words.slice(1)];
    const [cmd, ...args] = words;
    if (/^[$`]/.test(cmd)) return 'the command word is a variable or substitution; run the command directly.';
    if (cmd.startsWith('-')) return `unexpected option ${cmd} in command position (exec -a / sudo -u …); run the command directly.`;
    if (cmd === 'popd') return 'popd changes to a directory the guard cannot track; use cd <path>.';
    if (cmd === 'cd' || cmd === 'pushd') {
      const target = args.find((a) => !/^-[LPe@]+$/.test(a));
      if (target === undefined) return `${cmd} without a path goes to $HOME; cd to an explicit path inside the repository.`;
      if (target === '-' || /[~$`*?[{]/.test(target)) return `${cmd} ${target}: use an explicit path (no ~, $, -, globs).`;
      const next = resolve(dir, unquote(target));
      if (!insideRoot(next)) return `${cmd} ${target}: outside the repository.`;
      dir = next;
      continue;
    }
    if (cmd === 'export' || cmd === 'declare' || cmd === 'typeset' || cmd === 'set' || cmd === 'setopt') {
      // segments() drops `NAME=value` words, so read the assignments from the raw segment.
      const bad = rest.trim().split(/\s+/).slice(1).map(unquote).find((a) => !a.startsWith('-') && ENV_BANNED(a.split('=')[0]));
      if (bad || cmd === 'setopt') return `${cmd} ${bad ?? args.join(' ')} changes what later commands run; not allowed.`;
    }
    const wrapped = wrapperReason(words) || (EXTRA_WRAPPERS.has(cmd)
      ? `${cmd} runs or rewrites something the guard cannot inspect; not allowed for the implementer.` : null);
    if (wrapped) return wrapped;
    if (cmd === 'git') {
      const r = checkGit(words, dir);
      if (r) return r;
    }
    if (cmd === 'gh') return 'gh is not allowed for the implementer — PRs and GitHub writes belong to the main session.';
    if (RUNNERS.has(cmd)) {
      // `pnpm exec gh …` arrives as `pnpm gh …`; re-check what the runner would execute.
      let inner = args;
      while (inner.length && (['exec', 'dlx', 'x', '--', 'pnpm', 'npm', 'yarn', 'npx', 'pnpx'].includes(inner[0]) || inner[0].startsWith('-'))) {
        inner = RUNNER_VALUE_OPTS.has(inner[0]) ? inner.slice(2) : inner.slice(1);
      }
      // Belt and braces: a blocked command named anywhere in a runner call is refused.
      if (args.some((a) => commandName(a) === 'gh')) return `${cmd} would run gh — not allowed for the implementer.`;
      if (inner.length && !/^lint:arch:baseline$/.test(inner[0])) {
        const r = checkBash(inner.join(' '), dir);
        if (r) return `${cmd} would run: ${r}`;
      }
    }
    if ((cmd === 'pnpm' || cmd === 'npm') && args.some((a) => /^lint:arch:baseline$/.test(a))) {
      return 'lint:arch:baseline would hide new onion violations; fix the violation instead.';
    }
    if (cmd === 'docker' && args[0] === 'compose' && args.includes('down')) return 'docker compose down destroys the local stack/DB; not allowed.';
    if (cmd === 'docker-compose' && args.includes('down')) return 'docker-compose down destroys the local stack/DB; not allowed.';
    if (cmd === 'rm' && args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive')) {
      const targetsRm = nonFlags(args);
      if (targetsRm.length === 0 || !targetsRm.every((t) => /(^|\/)\.next\/?$/.test(t))) {
        return 'recursive rm is allowed only on .next/; delete specific files instead.';
      }
    }
    if (cmd === 'pnpm' && (args[0] === 'build' || (args[0] === 'run' && args[1] === 'build'))) {
      const rel = relative(ROOT, dir);
      if (rel === 'client' || rel.startsWith(`client${sep}`) || args.includes('--dir') && args.includes('client')) {
        return 'pnpm build in client/ breaks a running dev server (shared .next/); not allowed — use typecheck/tests.';
      }
    }
    // segments() drops `key=value` words, so dd's of= target is read from the raw segment.
    const ddTargets = cmd === 'dd' ? [...rest.matchAll(/(?:^|\s)of=(\S+)/g)].map((m) => unquote(m[1])) : [];
    for (const t of [...writeTargets(cmd, args), ...ddTargets]) {
      const r = checkTarget(t, dir);
      if (r) return r;
    }
    for (const d of destDirs(cmd, args)) {
      const r = checkDestDir(d, dir);
      if (r) return r;
    }
  }
  return null;
}

function tracked(rel, root) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const outside = (rel) => rel.startsWith('..') || isAbsolute(rel);

export function checkPath(filePath, root = ROOT) {
  if (!filePath) return null;
  const abs = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
  if (outside(relative(root, abs))) return `${filePath} is outside the repository.`;
  let rel;
  try {
    rel = relative(realpathSync.native(root), realTarget(abs));
  } catch {
    return `cannot resolve ${filePath}.`;
  }
  if (outside(rel)) return `${filePath} resolves outside the repository (symlink).`;
  rel = rel.split(sep).join('/');
  // Compare case-insensitively: on APFS `.GITHUB/workflows` IS `.github/workflows`. realTarget already
  // canonicalises existing folders; lowercasing also covers segments that do not exist yet.
  const lower = rel.toLowerCase();
  const base = lower.split('/').pop();
  if (/^\.env(\..*)?$/.test(base) && base !== '.env.example') return '.env files hold secrets; not editable by the implementer.';
  if (lower === '.github/workflows' || lower.startsWith('.github/workflows/')) return 'workflows (and their path filters) are out of scope for the implementer.';
  if (lower === '.claude' || lower.startsWith('.claude/')) return '.claude/** (settings, skills, agents, hooks) is not editable by the implementer.';
  if (lower === '.git' || lower.startsWith('.git/')) return '.git/** (config, hooks, refs) is not editable by the implementer.';
  if (lower === 'client/src/vendor/ui' || lower.startsWith('client/src/vendor/ui/')) return 'client/src/vendor/ui is the UI kit — do not touch unless the task is the UI kit.';
  if (lower.startsWith('server/src/db/migrations/') && (tracked(rel, root) || tracked(lower, root))) {
    return 'existing migrations are immutable; change the schema and run `pnpm db:generate` for a new one.';
  }
  return null;
}

async function main() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    input = null;
  }
  if (!input || typeof input !== 'object') {
    process.stderr.write('implementer-guard: blocked — unparsable hook input.\n');
    return 2;
  }
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  let reason = null;
  if (tool === 'Bash') reason = checkBash(String(ti.command || ''), input.cwd || ROOT);
  else if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') reason = checkPath(ti.file_path);
  if (reason) {
    process.stderr.write(`implementer-guard: blocked — ${reason}\n`);
    return 2;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
