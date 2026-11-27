#!/usr/bin/env node
// PreToolUse guard for the `implementer` subagent (.claude/agents/implementer.md).
// stdin = PreToolUse JSON ({ tool_name, tool_input, cwd }); exit 2 + stderr reason blocks the call.
// Commands are matched only in command position (after ; & | ( newline or $( ), never as substrings,
// so text that merely mentions `git push` inside an echo or heredoc body is not blocked by accident.
import { execFileSync } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { gitSubcommand, segments } from './shell-segments.mjs';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const GIT_BLOCKED = new Set(['commit', 'push', 'reset', 'checkout', 'switch', 'stash', 'rebase', 'merge', 'clean', 'restore']);

export function checkBash(command, cwd = ROOT) {
  let dir = cwd;
  for (const words of segments(command)) {
    const [cmd, ...args] = words;
    if (cmd === 'cd' && args[0]) { dir = resolve(dir, args[0]); continue; }
    if (cmd === 'git') {
      const sub = gitSubcommand(words);
      if (sub && GIT_BLOCKED.has(sub)) return `git ${sub} is not allowed for the implementer — the main session owns git state.`;
    }
    if (cmd === 'gh') return 'gh is not allowed for the implementer — PRs and GitHub writes belong to the main session.';
    if ((cmd === 'pnpm' || cmd === 'npm') && args.some((a) => /^lint:arch:baseline$/.test(a))) {
      return 'lint:arch:baseline would hide new onion violations; fix the violation instead.';
    }
    if (cmd === 'docker' && args[0] === 'compose' && args.includes('down')) return 'docker compose down destroys the local stack/DB; not allowed.';
    if (cmd === 'docker-compose' && args.includes('down')) return 'docker-compose down destroys the local stack/DB; not allowed.';
    if (cmd === 'rm' && args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive')) {
      const targets = args.filter((a) => !a.startsWith('-'));
      if (targets.length === 0 || !targets.every((t) => /(^|\/)\.next\/?$/.test(t))) {
        return 'recursive rm is allowed only on .next/; delete specific files instead.';
      }
    }
    if (cmd === 'pnpm' && (args[0] === 'build' || (args[0] === 'run' && args[1] === 'build'))) {
      const rel = relative(ROOT, dir);
      if (rel === 'client' || rel.startsWith(`client${sep}`) || args.includes('--dir') && args.includes('client')) {
        return 'pnpm build in client/ breaks a running dev server (shared .next/); not allowed — use typecheck/tests.';
      }
    }
  }
  return null;
}

function tracked(rel) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function checkPath(filePath) {
  if (!filePath) return null;
  const abs = isAbsolute(filePath) ? filePath : resolve(ROOT, filePath);
  const rel = relative(ROOT, abs).split(sep).join('/');
  if (rel.startsWith('..')) return `${filePath} is outside the repository.`;
  const base = rel.split('/').pop();
  if (/^\.env(\..*)?$/.test(base) && base !== '.env.example') return '.env files hold secrets; not editable by the implementer.';
  if (rel.startsWith('.github/workflows/')) return 'workflows (and their path filters) are out of scope for the implementer.';
  if (rel.startsWith('.claude/')) return '.claude/** (settings, skills, agents, hooks) is not editable by the implementer.';
  if (rel.startsWith('client/src/vendor/ui/')) return 'client/src/vendor/ui is the UI kit — do not touch unless the task is the UI kit.';
  if (rel.startsWith('server/src/db/migrations/') && tracked(rel)) {
    return 'existing migrations are immutable; change the schema and run `pnpm db:generate` for a new one.';
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
    return 0;
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
