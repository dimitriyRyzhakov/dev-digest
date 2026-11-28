// Tests for readonly-bash-guard (architecture-reviewer, plan-verifier).
// Run from the repo root: node --test '.claude/agents/hooks/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
process.env.CLAUDE_PROJECT_DIR = ROOT;
const { checkGrep, checkReadonlyBash, checkReadPath } = await import('./readonly-bash-guard.mjs');
const GUARD = join(HERE, 'readonly-bash-guard.mjs');

const ALLOW = [
  ['git diff origin/main...HEAD --stat', ''],
  ['git -C . log --oneline -5', ''],
  ['git status 2>&1 | head -50', ''],
  ['git diff -U0 origin/main -- server/src/app.ts', ''],
  ['git ls-files --others --exclude-standard', ''],
  ['git rev-parse --show-toplevel', ''],
  ['cat server/.env.example', ''],
  ['head -n 40 .claude/agents/planner.md', ''],
  ['cd server && pnpm lint:arch', ''],
  ['cd server && pnpm typecheck', ''],
  ['pnpm run typecheck', 'client'],
  ['cd client && pnpm exec eslint --no-warn-ignored src/x.tsx', ''],
  ["cd server && pnpm exec vitest related --run --exclude '**/*.it.test.ts' src/a.ts", ''],
  ['cd server && pnpm exec vitest run .it.test 2>&1 | tail -30', ''],
  ['cd reviewer-core && npm run typecheck', ''],
  ['cd reviewer-core && npm test -- test/run.test.ts', ''],
  ['cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err', ''],
  ["node --test '.claude/agents/hooks/*.test.mjs'", ''],
  ['node --test .claude/agents/hooks/readonly-bash-guard.test.mjs', ''],
  // quoted metacharacters are arguments, not pipes / redirects (smoke-test false positives)
  ["git diff -U0 -G'process\\.env|from .@devdigest/shared' HEAD~1..HEAD -- client/src", ''],
  ["git log --oneline --grep='a -> b' -5", ''],
  ['git grep -n "foo|bar" -- server/src', ''],
  ['git blame -L 1,20 server/src/app.ts', ''],
  // self-review HIGH fixes: exact names still pass
  ['head -n 5 README.md', ''],
  ["git diff HEAD -- 'server/src/*.ts'", ''],
  ["git log --oneline -- ':!*.lock' server/src", ''],
  ['git blame -L 1,5 -- server/src/app.ts', ''],
  // round 3: revisions still pass the path-arg check
  ['git log -1 HEAD~1 --oneline', ''],
  ['git show HEAD^ -- server/src/app.ts', ''],
  ['git diff origin/main...HEAD --stat', ''],
  ['cd server && pnpm test --reporter=verbose', ''],
  ['cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err', ''],
];

const BLOCK = [
  ['pnpm lint:arch:baseline', 'server'],
  ['cd server && pnpm run lint:arch:baseline', ''],
  ['git commit -m x', ''],
  ['git push', ''],
  ['git checkout main', ''],
  ['git -c core.pager=sh log', ''],
  ['git -C /tmp log', ''],
  ['git diff --output=x', ''],
  ['git diff --no-index /etc/passwd x', ''],
  ['rm -rf x', ''],
  ['cat server/.env', ''],
  ['head .env.local', ''],
  ['cat ~/.devdigest/secrets.json', ''],
  ['cat ../outside.txt', ''],
  ['git log > out.txt', ''],
  ['cat <<EOF', ''],
  ['echo $(rm x)', ''],
  ['echo `rm x`', ''],
  ['cd client && pnpm exec eslint --fix src', ''],
  ['cd client && pnpm exec vitest -u', ''],
  ['cd client && pnpm exec vitest run -u', ''],
  ['cd server && pnpm exec vitest related src/a.ts', ''],
  ['cd server && pnpm exec vitest run --coverage', ''],
  ['npm test', ''],
  ['cd reviewer-core && pnpm typecheck', ''],
  ['cd reviewer-core && npm install', ''],
  ['pnpm build', 'client'],
  ['pnpm --filter server typecheck', ''],
  ['pnpm -C server typecheck', ''],
  ['cd server && pnpm db:migrate', ''],
  ['cd server && npx depcruise --init', ''],
  ['cd server && pnpm exec depcruise --init', ''],
  ['node x.mjs', ''],
  ['node -e "require(\'fs\').writeFileSync(\'x\',\'y\')"', ''],
  ['node --test server/test', ''],
  ['node --test .claude/agents/hooks/', ''],
  ['node --test .claude/agents/hooks/readonly-bash-guard.mjs', ''],
  ['X=rm $X -rf .', ''],
  ['sleep 100 &', ''],
  ['cd /tmp && ls', ''],
  ['cd ~ && ls', ''],
  ['echo hi', ''],
  ['tee x.txt', ''],
  ['sed -i s/a/b/ x', ''],
  ['curl https://example.com', ''],
  ['git grep -O vim foo', ''],
  ['git grep --open-files-in-pager=vim foo', ''],
  ['git log "$(rm x)"', ''],
  ['git log "`rm x`"', ''],
  ['git log "abc', ''],
  ['git log \\> out.txt', ''],
  ["git log 'x' > out.txt", ''],
  // self-review HIGH: quoting / globs reach secrets
  ["cat 'server/.env'", ''],
  ['cat "server/.env"', ''],
  ["cat server/'.env'", ''],
  ['cat server/.e*', ''],
  ['cat server/.en?', ''],
  ['cat server/.env{,}', ''],
  ['cat server/.[e]nv', ''],
  // self-review HIGH: git flags that read untracked / arbitrary files
  ['git blame --contents=/Users/x/.devdigest/secrets.json -- README.md', ''],
  ['git blame --contents /etc/passwd -- README.md', ''],
  ['git grep --untracked KEY', ''],
  ['git grep --no-exclude-standard KEY', ''],
  ['git grep --no-index KEY', ''],
  ['git grep -f server/.env -- server/src', ''],
  ['git log -- server/.env', ''],
  ['git diff HEAD -- ../outside.txt', ''],
  ['git show HEAD --textconv', ''],
  // wrappers get a clear message
  ["bash -c 'git status'", ''],
  ['xargs cat', ''],
  // round 2 SEC-6: env prefixes change what an allowed command runs
  ['GIT_EXTERNAL_DIFF=rm git diff', ''],
  ['GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=x git status', ''],
  ['env FOO=1 git log', ''],
  ['cd server && NODE_OPTIONS=--require=./x.js pnpm typecheck', ''],
  ['git log && GIT_DIR=/tmp/other git log', ''],
  ['git --git-dir=/tmp/other log', ''],
  ['git --git-dir /tmp/other log', ''],
  ['git --work-tree=/tmp log', ''],
  ['git --namespace=x log', ''],
  ['git --super-prefix=x/ ls-files', ''],
  // round 2 SEC-1: path, quotes or expansion can't hide the command name
  ['/usr/bin/git push', ''],
  ['"git" push', ''],
  ['\\git push', ''],
  ['/bin/bash -c x', ''],
  ['$(which git) log', ''],
  ['$GIT log', ''],
  ['${GIT} log', ''],
  // round 3: shell un-escaping / brace expansion rebuilds banned flags after the check
  ['git diff --out\\put=/tmp/x HEAD~1', ''],
  ['git log -1 {--output=/tmp/x,--oneline}', ''],
  ['git diff --no-ind\\ex a b', ''],
  // round 3: implicit --no-index through a path outside the work tree
  ['git diff /dev/null server/.env', ''],
  ['git diff /dev/null ~/.devdigest/secrets.json', ''],
  ['git diff /dev/null README.md', ''],
  ['git diff README.md /etc/hosts', ''],
  // round 3: command word must be a bare name
  ['/usr/bin/git log', ''],
  ['"git" log', ''],
  // round 3: write-capable tool flags (allowlist now)
  ['pnpm test --reporter=json --output-file=/tmp/x', 'server'],
  ['pnpm exec eslint --suppress-all --suppressions-location /tmp/x src', 'client'],
  ['pnpm exec vitest run --clearCache', 'server'],
  ['pnpm exec vitest run --clear-cache', 'server'],
  ['pnpm exec eslint -f ./evil.js src', 'client'],
  ['pnpm exec depcruise src --output-to /tmp/x', 'server'],
  ['cd reviewer-core && npm test -- --outputFile=/tmp/x', ''],
  // round 4: git accepts abbreviated long options — only exact spellings on the allowlist pass
  ['git grep --untrac --no-exclude-st KEY', ''],
  ['git blame --conte=server/.env -- README.md', ''],
  ['git grep --open=rm -e x -- server/src', ''],
  ["git diff '--output=/tmp/x'", ''],
  ['git log --ext-diff', ''],
  ['git diff --textconv', ''],
  ['cat server/.ENV', ''],
  ['cat client/.Env.local', ''],
];

test('read-only bash: allowlisted commands pass', () => {
  for (const [cmd, sub] of ALLOW) {
    assert.equal(checkReadonlyBash(cmd, join(ROOT, sub)), null, cmd);
  }
});

test('read-only bash: everything else is blocked with a reason', () => {
  for (const [cmd, sub] of BLOCK) {
    const r = checkReadonlyBash(cmd, join(ROOT, sub));
    assert.ok(typeof r === 'string' && r.length > 0, `expected block: ${cmd}`);
  }
});

test('baseline gets its own message', () => {
  assert.match(checkReadonlyBash('cd server && pnpm lint:arch:baseline', ROOT), /baseline/);
});

test('Read / Grep paths: secrets blocked, normal files allowed', () => {
  for (const p of ['server/.env', '.env', join(ROOT, 'client/.env.local'), '/Users/x/.devdigest/secrets.json',
    '/Users/x/.devdigest', '/Users/x/.devdigest/', '~/.devdigest', '~/.devdigest/secrets.json',
    join(homedir(), '.devdigest'), '../../../.devdigest', "server/'.env'",
    // round 4: case-insensitive file system (APFS)
    '~/.DEVDIGEST/secrets.json', '/Users/x/.DevDigest/secrets.json', join(homedir(), '.DevDigest'), 'server/.ENV', '.Env.local']) {
    assert.ok(checkReadPath(p), p);
  }
  for (const p of ['server/.env.example', 'server/.ENV.EXAMPLE', 'server/src/app.ts', '.claude/agents/planner.md', undefined]) {
    assert.equal(checkReadPath(p), null, String(p));
  }
});

test('Grep (round 2 SEC-7): repo paths only, no secrets-reaching globs', () => {
  const blocked = [
    { path: homedir() }, { path: '~' }, { path: '~/' }, { path: '/Users' }, { path: '/' },
    { path: join(homedir(), '.devdigest') }, { path: '../' }, { path: '/private/tmp' },
    { path: 'server/.env' },
    { glob: 'secrets.json' }, { glob: '**/.devdigest/**' }, { glob: '**/.env*' }, { glob: '.env' },
    { glob: '.e*' }, { glob: '**/.en?' }, { glob: 'server/.[e]nv' }, { glob: '{.env,x}' }, { glob: '.env.local' },
  ];
  for (const ti of blocked) assert.ok(checkGrep({ pattern: 'KEY', ...ti }), JSON.stringify(ti));
  const allowed = [
    {}, { path: '' }, { path: ROOT }, { path: 'server/src' }, { path: join(ROOT, 'client') },
    { glob: '*.ts' }, { glob: '**/*.test.tsx' }, { glob: '.env.example' }, { glob: '**/.env.example' },
    { path: 'server', glob: '*.{ts,tsx}' },
  ];
  for (const ti of allowed) assert.equal(checkGrep({ pattern: 'KEY', ...ti }), null, JSON.stringify(ti));
});

function runHook(stdin) {
  return spawnSync('node', [GUARD], { input: stdin, env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT }, encoding: 'utf8' });
}

test('stdin: blocked → 2, allowed → 0, bad JSON → 2', () => {
  const blocked = runHook(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: ROOT }));
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /readonly-bash-guard: blocked/);
  const allowed = runHook(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: ROOT }));
  assert.equal(allowed.status, 0);
  const readSecret = runHook(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: join(ROOT, 'server/.env') } }));
  assert.equal(readSecret.status, 2);
  const grepDir = runHook(JSON.stringify({ tool_name: 'Grep', tool_input: { pattern: 'KEY', path: join(homedir(), '.devdigest') } }));
  assert.equal(grepDir.status, 2);
  const readOutside = runHook(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/private/tmp/tool-result.txt' } }));
  assert.equal(readOutside.status, 0);
  const grepGlob = runHook(JSON.stringify({ tool_name: 'Grep', tool_input: { pattern: 'KEY', glob: '**/.env*' } }));
  assert.equal(grepGlob.status, 2);
  assert.equal(runHook('not json').status, 2);
  assert.equal(runHook('').status, 2);
});
