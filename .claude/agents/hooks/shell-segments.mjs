// Shared shell-command parsing for the subagent PreToolUse guards in this folder.
// Commands are matched only in command position (after ; & | ( newline or $( ), never as substrings,
// so text that merely mentions `git push` inside an echo or heredoc body is not matched by accident.
// The parser is not quote-aware: odd quoting splits into extra segments, which every guard treats
// as more commands to check (fails closed), never fewer.
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SPLIT = /\$\(|[;&|()\n`]/;
const PREFIX_WORDS = new Set(['command', 'env', 'exec', 'sudo', 'builtin', 'nocorrect', 'noglob']);

/** `"gh"`, `\gh`, `/opt/homebrew/bin/gh` → `gh`, so a path or quoting can't hide the command name. */
export function commandName(word) {
  return word.replace(/['"\\]/g, '').split('/').pop();
}

/**
 * Split a shell command into simple-command segments, each with its leading words. `VAR=x` words and
 * prefix words (env, sudo, exec, command, …) are dropped; the command word is normalised with
 * commandName(). Use envPrefixes() to see the dropped assignments.
 */
export function segments(command) {
  return command
    .split(SPLIT)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+/).filter((w) => !/^\w+=\S*$/.test(w) && !PREFIX_WORDS.has(w)))
    .filter((w) => w.length > 0)
    .map(([cmd, ...rest]) => [commandName(cmd), ...rest]);
}

/**
 * Names of the environment assignments in front of each segment's command word (`GIT_DIR=x git …`,
 * `env NODE_OPTIONS=… node`). They change what the command does (GIT_EXTERNAL_DIFF, GIT_CONFIG_*,
 * NODE_OPTIONS, LD_PRELOAD), so guards must decide on them instead of ignoring them.
 */
export function envPrefixes(command) {
  const names = [];
  for (const s of command.split(SPLIT)) {
    for (const w of s.trim().split(/\s+/)) {
      if (!w || PREFIX_WORDS.has(w)) continue;
      const m = w.match(/^(\w+)=/);
      if (!m) break;
      names.push(m[1]);
    }
  }
  return names;
}

const SAFE_UNQUOTED = /[A-Za-z0-9_@%+=:,./-]/;
const STRUCTURAL = /[\s|&;<>()]/;

/**
 * First character the shell would EXPAND or UN-ESCAPE after the guard has looked at the words:
 * outside quotes anything but [A-Za-z0-9_@%+=:,./-] (plus `~` / `^` not at a word start) — so
 * backslash escapes (`--out\put`), braces (`{--output=x,y}`), globs (`.cl*`), `$` and a leading `~`
 * are caught; inside "…" `$`, backtick, `\` and `!`; inside '…' nothing (literal).
 * Structural characters (| & ; < > ( ) whitespace) are skipped — the guards check those separately.
 * Returns { char, index } or null; an unterminated quote returns { char: 'unterminated quote' }.
 * Use it in ALLOWLIST guards so the words they approve are exactly the words the shell runs.
 */
export function unsafeShellChar(command) {
  let quote = null;
  let wordStart = true;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote === "'") { if (c === "'") quote = null; continue; }
    if (quote === '"') {
      if (c === '"') { quote = null; continue; }
      if (/[$`\\!]/.test(c)) return { char: c, index: i };
      continue;
    }
    if (c === "'" || c === '"') { quote = c; wordStart = false; continue; }
    if (STRUCTURAL.test(c)) { wordStart = true; continue; }
    if (SAFE_UNQUOTED.test(c) || (!wordStart && (c === '~' || c === '^'))) { wordStart = false; continue; }
    return { char: c, index: i };
  }
  return quote ? { char: 'unterminated quote', index: command.length } : null;
}

/** True when a segment's raw command word is itself an expansion (`$X`, `${X}`, `$(…)`, backticks). */
export function hasDynamicCommand(command) {
  return command
    .split(/[;&|\n]/)
    .some((s) => /^\s*(?:\w+=\S*\s+)*(?:\$|`)/.test(s));
}

/**
 * Commands that run another command given as an argument or on stdin. A guard that checks only the
 * first word of a segment cannot see what they run, so guards block them outright.
 */
export const WRAPPERS = new Set([
  'bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'csh', 'tcsh', 'eval', 'source', '.',
  'xargs', 'timeout', 'gtimeout', 'nice', 'nohup', 'time', 'watch', 'parallel', 'script',
  'su', 'doas', 'busybox', 'osascript', 'open',
]);

/** Reason string if this segment runs a hidden command (wrapper, find -exec/-delete), else null. */
export function wrapperReason(words) {
  const [cmd, ...args] = words;
  if (WRAPPERS.has(cmd)) return `${cmd} runs another command the guard cannot inspect; run the command directly.`;
  if (cmd === 'find' && args.some((a) => /^-(exec|execdir|ok|okdir|delete|fprint\w*|fls)$/.test(a))) {
    return 'find with -exec / -delete / -fprint runs commands or writes files; not allowed.';
  }
  return null;
}

/**
 * Resolve symlinks: realpath of the deepest existing ancestor + the not-yet-existing rest, so a new
 * file in a new folder still resolves, and a symlinked file or folder resolves to where it points.
 */
export function realTarget(abs) {
  let dir = abs;
  const rest = [];
  while (!existsSync(dir)) {
    rest.unshift(dir.slice(dirname(dir).length + 1));
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  // .native canonicalises letter case on case-insensitive file systems (APFS): `.CLAUDE` → `.claude`.
  return join(realpathSync.native(dir), ...rest);
}

/** The git subcommand of a `git …` segment: git [-C path | -c k=v | --flag]… <sub>. */
export function gitSubcommand(words) {
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (w === '-C' || w === '-c') { i++; continue; }
    if (w.startsWith('-')) continue;
    return w;
  }
  return null;
}
