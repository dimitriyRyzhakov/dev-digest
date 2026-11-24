#!/usr/bin/env node
// Self-review helper: scope, deterministic checks and the PR gate.
// Used by the `self-review` skill (../SKILL.md) and by the PreToolUse hook in
// .claude/settings.json. Node >= 22, no dependencies.
//
//   node self-review.mjs scope  [--base <ref>]          → JSON: base, fingerprint, files, repoViolations, i18n
//   node self-review.mjs diff   [--base <ref>] (--bucket ui|backend|other|all | <paths…>)
//                                                       → unified diff, untracked files as added
//   node self-review.mjs checks [--base <ref>]          → runs typecheck/lint/tests, writes checks.json
//   node self-review.mjs gate                           → hook mode: stdin = PreToolUse JSON, exit 2 blocks
//
// Fingerprint = sha256 over sorted `path:<git blob sha1 | deleted>` of every changed file vs the
// merge-base. It ignores HEAD, so committing after a review keeps the report valid; any content
// change invalidates it.

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
const OUT_DIR = join(ROOT, '.claude', 'self-review');
const REPORT = join(OUT_DIR, 'report.json');
const CHECKS = join(OUT_DIR, 'checks.json');
// `gh pr create|new` only in command position (start, after ; & | ( newline, `$(`, optional env
// assignments / `command` / `env`), so the phrase inside a heredoc, echo or commit message is ignored.
const PR_CREATE = /(?:^|[;&|(\n]|\$\()\s*(?:(?:\w+=\S*|command|env|exec)\s+)*gh\s+pr\s+(?:create|new)\b/;
const PACKAGES = ['client', 'server', 'reviewer-core'];
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|sh|sql|json|ya?ml)$|(^|\/)(Dockerfile[^/]*|\.env[^/]*)$/;
const LINT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// ---------- git helpers ----------

function git(args, cwd = ROOT) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function resolveBase(ref) {
  const candidates = ref ? [ref] : ['origin/main', 'main'];
  for (const c of candidates) {
    const mb = tryGit(['merge-base', 'HEAD', c]);
    if (mb) return { ref: c, sha: mb.trim() };
  }
  throw new Error(`cannot resolve merge-base with ${candidates.join(' or ')}`);
}

function blobSha(buf) {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

// ---------- scope ----------

function collect(baseRef) {
  const base = resolveBase(baseRef);
  const entries = new Map(); // path -> status (A|M|D|?)
  const raw = git(['diff', '--name-status', '--no-renames', '-z', base.sha]).split('\0').filter(Boolean);
  for (let i = 0; i < raw.length; i += 2) entries.set(raw[i + 1], raw[i][0]);
  for (const p of git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) {
    entries.set(p, '?');
  }

  const files = [];
  const deleted = [];
  const parts = [];
  for (const [path, status] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    if (path.startsWith('.claude/self-review/')) continue;
    const abs = join(ROOT, path);
    if (status === 'D' || !existsSync(abs)) {
      deleted.push(path);
      parts.push(`${path}:deleted`);
      continue;
    }
    const st = lstatSync(abs);
    if (!st.isFile()) {
      // symlinks (e.g. a linked node_modules) and other non-regular entries: fingerprint, never review
      parts.push(`${path}:${st.isSymbolicLink() ? `link:${readlinkSync(abs)}` : 'nonfile'}`);
      continue;
    }
    const buf = readFileSync(abs);
    parts.push(`${path}:${blobSha(buf)}`);
    if (isBinary(buf)) continue;
    files.push({ path, status: status === '?' ? 'untracked' : status === 'A' ? 'added' : 'modified', ...classify(path, buf) });
  }
  const fingerprint = createHash('sha256').update(parts.join('\n')).digest('hex');
  return { base, files, deleted, fingerprint, statuses: entries };
}

function classify(path, buf) {
  const pkg = PACKAGES.find((p) => path.startsWith(`${p}/`)) ?? (path.startsWith('e2e/') ? 'e2e' : 'root');
  const skills = new Set();
  let bucket = 'other';
  const isTs = /\.(ts|tsx)$/.test(path);

  if (path.startsWith('client/src/') && isTs) {
    bucket = 'ui';
    if (path.startsWith('client/src/vendor/')) {
      skills.add('zod');
    } else {
      skills.add('frontend-architecture').add('react-best-practices').add('next-best-practices');
      if (/\.test\.tsx?$/.test(path)) skills.add('react-testing-library');
    }
  }

  const backendSrc = /^(server|reviewer-core)\/(src|test)\//.test(path);
  if (backendSrc && (isTs || path.endsWith('.sql'))) {
    bucket = 'backend';
    skills.add('onion-architecture');
    if (/\/routes\.ts$|^server\/src\/(app|server)\.ts$|^server\/src\/platform\//.test(path)) skills.add('fastify-best-practices');
    if (/\/repository(\.ts$|\/)|^server\/src\/db\//.test(path)) skills.add('drizzle-orm-patterns');
    if (/^server\/src\/db\/(schema|migrations)/.test(path)) skills.add('postgresql-table-design');
  }

  if (/\/vendor\/shared\//.test(path) || (isTs && /from\s+['"]zod['"]/.test(buf.toString('utf8')))) skills.add('zod');
  if (CODE_EXT.test(path)) skills.add('security');
  return { bucket, package: pkg, skills: [...skills] };
}

// Added line numbers (new-file numbering) per file; untracked files → every line.
function addedLines(baseSha, file) {
  const abs = join(ROOT, file.path);
  if (file.status === 'untracked') {
    const n = readFileSync(abs, 'utf8').split('\n').length;
    return new Set(Array.from({ length: n }, (_, i) => i + 1));
  }
  const out = git(['diff', '-U0', '--no-color', baseSha, '--', file.path]);
  const lines = new Set();
  for (const m of out.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    for (let i = 0; i < count; i++) lines.add(start + i);
  }
  return lines;
}

// ---------- deterministic repo rules (AGENTS.md "Do not touch" + gotchas) ----------

function repoViolations(scope) {
  const out = [];
  const { base, statuses } = scope;
  for (const [path, status] of statuses) {
    if (!path.startsWith('server/src/db/migrations/') || path.endsWith('/meta/_journal.json')) continue;
    if (status === 'M' || status === 'D') {
      out.push({
        id: `repo:migration:${path}`,
        severity: 'CRITICAL',
        source: 'repo-rule',
        file: path,
        line: 1,
        rule: 'AGENTS.md › Do not touch: existing files in server/src/db/migrations/**',
        problem: `Existing migration ${status === 'D' ? 'deleted' : 'modified'}.`,
        fix: 'Revert it and generate a new migration (`pnpm db:generate` in server/).',
      });
    }
  }

  for (const [path, status] of statuses) {
    if (!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(path) || status !== 'M') continue;
    const before = tryGit(['show', `${base.sha}:${path}`]) ?? '';
    const after = existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), 'utf8') : '';
    if (pathFilters(before) !== pathFilters(after)) {
      out.push({
        id: `repo:workflow-paths:${path}`,
        severity: 'CRITICAL',
        source: 'repo-rule',
        file: path,
        line: 1,
        rule: 'AGENTS.md › Do not touch: .github/workflows/* path filters unless the task is CI',
        problem: 'Workflow `paths` / `paths-ignore` filters changed.',
        fix: 'Revert the filter change, or get an explicit user waiver that this task is CI work.',
      });
    }
  }

  const changed = new Set([...statuses.keys()]);
  for (const path of changed) {
    const m = path.match(/^(server|client)\/src\/vendor\/shared\/(.+)$/);
    if (!m) continue;
    const twin = `${m[1] === 'server' ? 'client' : 'server'}/src/vendor/shared/${m[2]}`;
    if (!changed.has(twin) && existsSync(join(ROOT, twin))) {
      out.push({
        id: `repo:shared-drift:${path}`,
        severity: 'HIGH',
        source: 'repo-rule',
        file: path,
        line: 1,
        rule: 'AGENTS.md › Gotchas: @devdigest/shared exists twice; contract change → update both',
        problem: `Changed here but not in ${twin}.`,
        fix: `Mirror the contract change in ${twin} (or confirm it is server- or client-only).`,
      });
    }
  }
  return out;
}

function pathFilters(yaml) {
  const lines = yaml.split('\n');
  const keep = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(paths|paths-ignore):/);
    if (!m) continue;
    keep.push(lines[i].trim());
    const indent = m[1].length;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === '') continue;
      if (l.match(/^\s*/)[0].length <= indent && !l.trim().startsWith('-')) break;
      keep.push(l.trim());
      i = j;
    }
  }
  return keep.join('\n');
}

// ---------- i18n (next-intl, client/messages/en/<ns>.json) ----------

let messagesCache;
function messages() {
  if (messagesCache) return messagesCache;
  const dir = join(ROOT, 'client', 'messages', 'en');
  messagesCache = {};
  if (!existsSync(dir)) return messagesCache;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      messagesCache[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      /* broken JSON surfaces in typecheck/tests */
    }
  }
  return messagesCache;
}

function hasKey(path) {
  let node = messages();
  for (const seg of path.split('.')) {
    if (node === null || typeof node !== 'object' || !(seg in node)) return false;
    node = node[seg];
  }
  return true;
}

function i18nFindings(scope) {
  const out = [];
  for (const file of scope.files) {
    if (!/^client\/src\/.+\.tsx$/.test(file.path) || /\.test\.tsx$/.test(file.path) || file.path.includes('/vendor/')) continue;
    const text = readFileSync(join(ROOT, file.path), 'utf8');
    const lines = text.split('\n');
    const added = addedLines(scope.base.sha, file);

    const vars = new Map();
    for (const m of text.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:["']([^"']*)["'])?\s*\)/g)) {
      vars.set(m[1], m[2] ?? '');
      const lineNo = text.slice(0, m.index).split('\n').length;
      if (m[2] && added.has(lineNo) && !hasKey(m[2])) {
        out.push(i18n(file.path, lineNo, 'HIGH', `Namespace "${m[2]}" not found in client/messages/en.`, 'Add the namespace/keys to the matching messages/en/<ns>.json.'));
      }
    }
    const callRe = vars.size ? new RegExp(`\\b(${[...vars.keys()].join('|')})(?:\\.(rich|markup|raw))?\\(\\s*["']([^"'\\s]+)["']`, 'g') : null;

    for (const lineNo of added) {
      const line = lines[lineNo - 1];
      if (line === undefined) continue;
      if (callRe) {
        for (const m of line.matchAll(callRe)) {
          const prefix = vars.get(m[1]);
          const key = prefix ? `${prefix}.${m[3]}` : m[3];
          if (!hasKey(key)) out.push(i18n(file.path, lineNo, 'HIGH', `Translation key "${key}" not found in client/messages/en.`, `Add "${key}" to messages/en/${key.split('.')[0]}.json.`));
        }
      }
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) continue;
      for (const m of line.matchAll(/>\s*([A-Za-z][^<>{}`]*[A-Za-z.!?…])\s*</g)) {
        out.push(i18n(file.path, lineNo, 'MEDIUM', `Hardcoded UI text "${m[1].trim()}".`, 'Move it to messages/en/<ns>.json and render via t().'));
      }
      for (const m of line.matchAll(/\b(aria-label|title|placeholder|alt)=["']([^"']*[A-Za-z]{2}[^"']*)["']/g)) {
        out.push(i18n(file.path, lineNo, 'MEDIUM', `Hardcoded ${m[1]} "${m[2]}".`, 'Use t() for user-visible attribute text.'));
      }
    }
  }
  return out;
}

function i18n(file, line, severity, problem, fix) {
  return { id: `i18n:${file}:${line}:${problem.slice(0, 40)}`, severity, source: 'i18n', file, line, rule: 'i18n: user-visible strings live in client/messages/en', problem, fix };
}

// ---------- diff for reviewers ----------

function printDiff(scope, selector) {
  const picked = selector.bucket
    ? scope.files.filter((f) => selector.bucket === 'all' || f.bucket === selector.bucket)
    : scope.files.filter((f) => selector.paths.includes(f.path));
  const tracked = picked.filter((f) => f.status !== 'untracked').map((f) => f.path);
  let out = '';
  if (tracked.length) out += git(['diff', '--no-color', scope.base.sha, '--', ...tracked]);
  for (const f of picked.filter((f) => f.status === 'untracked')) {
    const body = readFileSync(join(ROOT, f.path), 'utf8').split('\n');
    out += `diff --git a/${f.path} b/${f.path}\nnew file (untracked)\n--- /dev/null\n+++ b/${f.path}\n@@ -0,0 +1,${body.length} @@\n${body.map((l) => `+${l}`).join('\n')}\n`;
  }
  process.stdout.write(out || '(no changes for this selection)\n');
}

// ---------- deterministic checks ----------

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' } });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('error', (e) => resolve({ code: 127, output: String(e) }));
    child.on('close', (code) => resolve({ code, output }));
  });
}

const tail = (s, n = 60) => s.replace(/\x1b\[[0-9;]*m/g, '').trimEnd().split('\n').slice(-n).join('\n');

async function runChecks(scope) {
  // Docs-only changes (AGENTS.md, INSIGHTS.md, …) in a package don't trigger its checks.
  const changed = new Set(scope.files.filter((f) => CODE_EXT.test(f.path)).map((f) => f.package));
  const plan = new Map(); // package -> [{check, args}]
  const rel = (pkg, re) => scope.files.filter((f) => f.package === pkg && re.test(f.path)).map((f) => f.path.slice(pkg.length + 1));

  if (changed.has('client')) {
    const lint = rel('client', LINT_EXT);
    const steps = [{ check: 'typecheck', args: ['typecheck'] }];
    if (lint.length) {
      steps.push({ check: 'eslint', args: ['exec', 'eslint', '--no-warn-ignored', ...lint] });
      steps.push({ check: 'vitest related', args: ['exec', 'vitest', 'related', '--run', '--passWithNoTests', ...lint] });
    }
    plan.set('client', steps);
  }
  const backendTouched = changed.has('server') || changed.has('reviewer-core');
  if (backendTouched) {
    const steps = [
      { check: 'typecheck', args: ['typecheck'] },
      { check: 'lint:arch', args: ['lint:arch'] },
    ];
    const tests = [...rel('server', /\.ts$/), ...rel('reviewer-core', /\.ts$/).map((p) => `../reviewer-core/${p}`)];
    if (tests.length) {
      steps.push({ check: 'vitest related (unit)', args: ['exec', 'vitest', 'related', '--run', '--passWithNoTests', '--exclude', '**/*.it.test.ts', ...tests] });
    }
    plan.set('server', steps);
  }
  const sharedTouched = scope.files.some((f) => f.path.startsWith('server/src/vendor/shared/'));
  if (changed.has('reviewer-core') || sharedTouched) {
    const steps = [{ check: 'typecheck', args: ['typecheck'] }];
    const tests = rel('reviewer-core', /\.ts$/);
    if (tests.length) steps.push({ check: 'vitest related', args: ['exec', 'vitest', 'related', '--run', '--passWithNoTests', ...tests] });
    plan.set('reviewer-core', steps);
  }

  const results = await Promise.all(
    [...plan].map(async ([pkg, steps]) => {
      const cwd = join(ROOT, pkg);
      if (!existsSync(join(cwd, 'node_modules'))) {
        return steps.map((s) => ({ package: pkg, check: s.check, ok: null, skipped: true, severity: 'HIGH', output: `${pkg}/node_modules missing — run \`pnpm install\` in ${pkg}/` }));
      }
      const res = [];
      const scripts = readJson(join(cwd, 'package.json'))?.scripts ?? {};
      for (const s of steps) {
        const missing =
          s.args[0] !== 'exec' && !scripts[s.args[0]]
            ? `script "${s.args[0]}" not defined in ${pkg}/package.json`
            : s.args[1] === 'eslint' && !readdirSync(cwd).some((f) => /^eslint\.config\.(js|mjs|cjs|ts)$/.test(f))
              ? `no eslint.config.* in ${pkg}/`
              : null;
        if (missing) {
          res.push({ package: pkg, check: s.check, ok: null, skipped: true, severity: 'HIGH', output: missing });
          continue;
        }
        const started = Date.now();
        const { code, output } = await run('pnpm', s.args, cwd);
        res.push({ package: pkg, check: s.check, command: `pnpm ${s.args.join(' ')}`, ok: code === 0, skipped: false, severity: code === 0 ? null : 'CRITICAL', ms: Date.now() - started, output: tail(output) });
      }
      return res;
    }),
  );
  return results.flat();
}

// ---------- gate ----------

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function gateReasons(report, checks, scope) {
  const reasons = [];
  if (!report) return ['no self-review report (.claude/self-review/report.json is missing)'];
  if (report.fingerprint !== scope.fingerprint) reasons.push('report is stale: files changed after the last self-review');
  if (!checks || checks.fingerprint !== scope.fingerprint) reasons.push('deterministic checks were not run for the current diff');
  else {
    const failed = checks.results.filter((r) => r.ok === false);
    if (failed.length) reasons.push(`failed checks: ${failed.map((r) => `${r.package} ${r.check}`).join(', ')}`);
  }
  const waived = new Set((report.waivers ?? []).filter((w) => w.userQuote).map((w) => w.id));
  const repoCrit = repoViolations(scope).filter((v) => v.severity === 'CRITICAL' && !waived.has(v.id));
  if (repoCrit.length) reasons.push(`repo-rule violations: ${repoCrit.map((v) => v.file).join(', ')}`);
  const crit = (report.findings ?? []).filter((f) => f.severity === 'CRITICAL' && !f.preExisting && !waived.has(f.id));
  if (crit.length) reasons.push(`${crit.length} CRITICAL finding(s) in the report`);
  if (report.verdict !== 'APPROVE') reasons.push(`verdict is ${report.verdict ?? 'missing'}`);
  return reasons;
}

async function gate() {
  let input = {};
  try {
    input = JSON.parse((await readStdin()) || '{}');
  } catch {
    return 0;
  }
  const command = String(input?.tool_input?.command ?? '');
  if (!PR_CREATE.test(command)) return 0;

  const report = readJson(REPORT);
  const checks = readJson(CHECKS);
  const scope = collect(report?.base?.ref);
  const reasons = gateReasons(report, checks, scope);
  if (!reasons.length) return 0;
  process.stderr.write(
    `Self-review gate: PR creation blocked.\n- ${reasons.join('\n- ')}\n` +
      'Run the self-review skill (.claude/skills/self-review/SKILL.md), fix every CRITICAL, re-run until verdict APPROVE, then open the PR with .claude/self-review/summary.md in the body.\n',
  );
  return 2;
}

// ---------- CLI ----------

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'gate') return gate();

  const scope = collect(arg('--base'));
  if (cmd === 'scope') {
    const summary = { ui: 0, backend: 0, other: 0 };
    for (const f of scope.files) summary[f.bucket]++;
    const out = {
      base: scope.base,
      fingerprint: scope.fingerprint,
      summary: { files: scope.files.length, deleted: scope.deleted.length, ...summary, packages: [...new Set(scope.files.map((f) => f.package))] },
      files: scope.files,
      deleted: scope.deleted,
      repoViolations: repoViolations(scope),
      i18n: i18nFindings(scope),
    };
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return 0;
  }
  if (cmd === 'diff') {
    const bucket = arg('--bucket');
    const paths = process.argv.slice(3).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--base' && all[i - 1] !== '--bucket');
    printDiff(scope, bucket ? { bucket } : { paths });
    return 0;
  }
  if (cmd === 'checks') {
    const results = await runChecks(scope);
    mkdirSync(dirname(CHECKS), { recursive: true });
    const payload = { fingerprint: scope.fingerprint, base: scope.base, createdAt: new Date().toISOString(), results };
    writeFileSync(CHECKS, `${JSON.stringify(payload, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return results.some((r) => r.ok === false) ? 1 : 0;
  }
  process.stderr.write('usage: self-review.mjs scope|diff|checks|gate [--base <ref>]\n');
  return 64;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    // Fail closed only for PR creation; any other command must never be blocked by a gate bug.
    if (process.argv[2] === 'gate') {
      process.stderr.write(`Self-review gate error: ${err.message}\n`);
      process.exit(2);
    }
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
  },
);
