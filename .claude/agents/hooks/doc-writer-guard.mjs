#!/usr/bin/env node
// PreToolUse guard for the `doc-writer` subagent (.claude/agents/doc-writer.md).
// stdin = PreToolUse JSON ({ tool_name, tool_input }); exit 2 + stderr reason blocks the call.
// Deny by default: only Markdown in known doc locations is writable. Fails closed on bad input.
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const DENY_BASENAMES = new Set(['insights.md', 'agents.md', 'claude.md']);
const DENY_PREFIXES = [/^\.claude\//, /^\.github\//, /^\.cursor\//, /(^|\/)node_modules\//, /^client\/src\/vendor\//, /(^|\/)specs\//];

const PKG = '(?:server|client|reviewer-core|e2e)';
const ALLOW = [
  /^README\.md$/,
  new RegExp(`^${PKG}/README\\.md$`),
  new RegExp(`^${PKG}/docs/(?:[\\w.-]+/)*[\\w.-]+\\.md$`),
  /^server\/src\/modules\/[\w-]+\/README\.md$/,
  /^docs\/(?:agent-prompts|skills)\/(?:[\w.-]+\/)*README\.md$/,
];

const toPosix = (p) => p.split(sep).join('/');
const outside = (rel) => rel === '' || rel.startsWith('..') || isAbsolute(rel);

/** Resolve symlinks of the deepest existing ancestor, so a new file in a new folder still resolves. */
function realTarget(abs) {
  let dir = abs;
  const rest = [];
  while (!existsSync(dir)) {
    rest.unshift(dir.slice(dirname(dir).length + 1));
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return join(realpathSync(dir), ...rest);
}

export function checkPath(filePath, root = ROOT) {
  if (typeof filePath !== 'string' || filePath.trim() === '') return 'missing file_path.';
  const abs = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
  if (outside(relative(root, abs))) return `${filePath} is outside the repository.`;

  let realRoot;
  let rel;
  try {
    realRoot = realpathSync(root);
    rel = relative(realRoot, realTarget(abs));
  } catch {
    return `cannot resolve ${filePath}.`;
  }
  if (outside(rel)) return `${filePath} resolves outside the repository (symlink).`;
  rel = toPosix(rel);

  if (!/\.md$/i.test(rel)) return 'doc-writer writes Markdown (.md) only.';
  const base = rel.split('/').pop().toLowerCase();
  if (base === 'insights.md') return 'INSIGHTS.md is owned by the engineering-insights skill — put lesson candidates in the report.';
  if (DENY_BASENAMES.has(base)) return `${base} holds agent instructions, not docs — suggest the change in the report.`;
  if (DENY_PREFIXES.some((re) => re.test(rel))) return `${rel} is not a doc location (agent config, CI, vendor, or specs).`;
  if (ALLOW.some((re) => re.test(rel))) return null;
  return `${rel} is not a doc location — see the "Where a doc goes" table in doc-writer.md.`;
}

async function main() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  let input;
  try {
    input = JSON.parse(data || '');
  } catch {
    process.stderr.write('doc-writer-guard: blocked — unparsable hook input.\n');
    return 2;
  }
  const tool = input?.tool_name;
  if (tool !== 'Edit' && tool !== 'Write' && tool !== 'MultiEdit') return 0;
  const reason = checkPath(input?.tool_input?.file_path);
  if (reason) {
    process.stderr.write(`doc-writer-guard: blocked — ${reason}\n`);
    return 2;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code));
}
