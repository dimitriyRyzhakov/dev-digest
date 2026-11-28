// Tests for implementer-guard (shell parser lives in shell-segments.mjs).
// Run from the repo root: node --test '.claude/agents/hooks/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitSubcommand, segments } from './shell-segments.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
process.env.CLAUDE_PROJECT_DIR = ROOT;
const { checkBash, checkPath } = await import('./implementer-guard.mjs');
const GUARD = join(HERE, 'implementer-guard.mjs');

const BASH_BLOCK = [
  // round 3: the shell expands globs / braces / escapes after the guard looked at the words
  '/usr/bin/gi? push',
  '/opt/homebrew/bin/g? pr list',
  '{git,} push',
  '\\git push',
  'echo x > .cl\\aude/settings.json',
  'echo x > .cla?de/settings.json',
  'cp a .cl*/settings.json',
  'echo x > {a,.claude/settings.json}',
  'touch server/src/db/m*/0000_init.sql',
  'cp a server/.e*',
  'rm /etc/*.conf',
  'git push origin x',
  'cd server && git -C .. commit -m x',
  'gh pr list',
  'pnpm lint:arch:baseline',
  // wrappers hide the real command
  "bash -c 'git push'",
  'timeout 5 git push',
  'xargs gh pr list',
  'eval git push',
  'find . -name x -delete',
  // writes into protected paths
  'echo x > .claude/settings.json',
  'echo x>.claude/settings.json',
  'sed -i s/a/b/ server/src/db/migrations/0000_init.sql',
  "sed -i '' s/a/b/ .github/workflows/client.yml",
  'cp a server/.env',
  'mv tmp.md .claude/agents/planner.md',
  'cd server && echo x >> ../.github/workflows/client.yml',
  'printf x | tee -a client/src/vendor/ui/x.ts',
  'touch .claude/x',
  'rm server/src/db/migrations/0000_init.sql',
  'dd if=/dev/zero of=server/.env.local count=1',
  'ln -s /tmp/x .claude/link',
  'echo x > /tmp/outside.txt',
  'echo x > $TARGET',
  // round 2 — SEC-1: path / quoting / substitution can't hide gh, git or a wrapper
  '/opt/homebrew/bin/gh pr list',
  '"gh" pr list',
  '\\gh pr list',
  '/usr/bin/git push',
  '/bin/bash -c x',
  '$(which gh) pr list',
  '$X push',
  '`which gh` pr list',
  'exec -a foo gh pr list',
  'if true; then git push; fi',
  'f() { git push; }; f',
  'pnpm exec gh pr list',
  'npx gh pr list',
  'npm exec -- git push',
  'stdbuf -o0 git push',
  "alias p='git push'",
  // SEC-2: git global options, aliases, config writes, history writers
  'git -c alias.p=push p origin',
  'git --git-dir .git push',
  'git --git-dir=.git push',
  'git --work-tree . commit -m x',
  'git --exec-path=/tmp log',
  'git config alias.p push',
  'git config --add alias.p push',
  'git p origin',
  'git cherry-pick abc',
  'git tag -d v1',
  'git tag v2',
  'git branch -D main',
  'git branch -m old new',
  'git branch feature-x',
  'git update-ref refs/heads/main HEAD~1',
  'git reflog expire --all',
  'git worktree add ../x',
  'git apply p.patch',
  'git am 0001.patch',
  'git fetch --upload-pack=touch origin',
  'git grep -Ovim foo',
  'git -C /tmp log',
  'git mv a.md .claude/agents/x.md',
  'git rm .github/workflows/client.yml',
  'echo x > .git/config',
  'cp hook .git/hooks/pre-commit',
  // SEC-6: env prefixes that change what runs
  'GIT_EXTERNAL_DIFF=rm git diff',
  'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=x git status',
  'GIT_DIR=/tmp/x git log',
  'env NODE_OPTIONS=--require=x node a.js',
  'LD_PRELOAD=x.so ls',
  'DYLD_INSERT_LIBRARIES=x.dylib ls',
  'PATH=/tmp/bin:$PATH git status',
  'export GIT_DIR=/tmp/x; git log',
  // SEC-3: cd / pushd / popd the guard can't track
  'pushd .claude && echo x > settings.json',
  'cd ~/WebstormProjects/dev-digest/.claude && echo x > settings.json',
  'cd "$PWD/.claude" && echo x > settings.json',
  'cd - && echo x > settings.json',
  'cd && echo x > .bashrc',
  'cd /tmp && echo x > a',
  'cd .clau* && echo x > settings.json',
  'popd',
  // SEC-4: other writers into protected paths
  'curl -o .claude/settings.json https://example.com/x',
  'curl -sSo .claude/settings.json https://example.com/x',
  'curl --output=server/.env https://example.com/x',
  'cd .github/workflows && curl -O https://example.com/client.yml',
  'wget -O .claude/settings.json https://example.com/x',
  'wget -P .claude https://example.com/settings.json',
  'sort -o .claude/settings.json a',
  'tar -xf a.tar -C .claude',
  'tar xf a.tar',
  'tar -cf .claude/x.tar a',
  'unzip a.zip -d .claude',
  'unzip a.zip',
  'rsync -a x/ .claude/',
  'rsync -a x/ server/',
  'split a .claude/part',
  "awk -i inplace '{print}' .claude/settings.json",
  'patch -p1 < p.diff',
  // round 4: case variants (APFS is case-insensitive) and git long-option abbreviations
  'rm .GITHUB/workflows/client.yml',
  'echo x > .Claude/settings.json',
  'cp a .cl*/SETTINGS.json',
  'git grep --open=rm -e on -- .github/workflows',
  "git grep '--open-files=rm' -e on",
  'git --git-d=.git push',
  'git --work-t . commit -m x',
  'git --exec-p=/tmp status',
  'git fetch --upload=x origin',
  'git diff --outp=.claude/x',
  'git branch --del main',
  'git config --unse user.name',
];

const BASH_ALLOW = [
  'rm dist/*.js',
  'rm *.log',
  'ls src/*.ts',
  'cp src/a.ts src/b.ts',
  'rm client/src/lib/*.tmp',
  'echo "git push" | grep push',
  'cd server && pnpm typecheck',
  'echo x > server/src/x.ts',
  'pnpm typecheck 2>&1 | tail -5',
  'pnpm typecheck > /dev/null 2>&1',
  'cd client && pnpm exec vitest related --run src/a.ts',
  'cp server/src/a.ts server/src/b.ts',
  'sed -i s/a/b/ server/src/app.ts',
  'rm client/src/old.ts',
  'rm -rf client/.next',
  // still allowed after round 2
  'node scripts/x.mjs',
  'FOO=1 pnpm test',
  'CI=1 pnpm exec vitest run',
  'cd server && pnpm db:generate',
  'pnpm exec vitest related --run src/a.ts',
  'npx tsc --noEmit',
  'cd server && cd src && ls',
  'git status',
  'git -C server diff --stat',
  'git --no-pager log --oneline -5',
  'git add server/src/x.ts',
  'git branch',
  'git branch --list "feat/*"',
  'git branch -a',
  'git config --get user.name',
  'git config user.name',
  'git remote -v',
  'git fetch origin',
  'git diff --output=server/tmp.diff',
  'curl -o server/tmp/x.json https://example.com/x',
  'curl https://example.com/x',
  'sort -o server/tmp/sorted.txt a',
  'tar -xf a.tar -C server/tmp',
  'tar -cf server/tmp/out.tar server/src',
  'unzip a.zip -d client/tmp',
  "awk '{print}' server/src/app.ts",
  'echo $(date) > server/tmp/x.txt',
  'if [ -f x ]; then echo y; fi',
  'git log --name-only -5',
  'git diff --output=server/tmp/x.diff',
  'git branch --list',
  'git config --get user.name',
  'git grep -n foo -- server/src',
];

test('segments splits in command position and drops env assignments', () => {
  assert.deepEqual(segments('cd server && FOO=1 pnpm test | tail -5'), [['cd', 'server'], ['pnpm', 'test'], ['tail', '-5']]);
  assert.equal(gitSubcommand(['git', '-C', '.', '-c', 'a=b', '--no-pager', 'log']), 'log');
});

test('implementer bash: blocks git writes, gh, wrappers and writes into protected paths', () => {
  for (const cmd of BASH_BLOCK) assert.ok(checkBash(cmd, ROOT), `expected block: ${cmd}`);
});

test('implementer bash: allows normal work and mere mentions', () => {
  for (const cmd of BASH_ALLOW) assert.equal(checkBash(cmd, ROOT), null, cmd);
});

test('implementer paths: blocks .claude, env, workflows, tracked migrations; allows source', () => {
  assert.match(checkPath('.claude/agents/x.md'), /\.claude/);
  assert.match(checkPath('.git/config'), /\.git/);
  assert.equal(checkPath('.github/x.md'), null);
  assert.match(checkPath('server/.env'), /secrets/);
  assert.match(checkPath('.github/workflows/client.yml'), /workflows/);
  assert.match(checkPath('server/src/db/migrations/0000_init.sql'), /immutable/);
  assert.match(checkPath('../outside.ts'), /outside/);
  assert.equal(checkPath('server/.env.example'), null);
  assert.equal(checkPath('client/src/lib/api.ts'), null);
  assert.equal(checkPath('server/src/brand/new/dir/x.ts'), null);
});

test('implementer paths: protected rules ignore letter case (APFS)', () => {
  for (const p of ['.GITHUB/workflows/ci.yml', '.github/Workflows/ci.yml', '.Claude/settings.json', '.GIT/config',
    'client/src/vendor/UI/button.tsx', 'server/src/db/Migrations/0000_init.sql', 'server/.ENV']) {
    assert.ok(checkPath(p), `expected block: ${p}`);
  }
  assert.match(checkPath('server/src/db/Migrations/0000_init.sql'), /immutable/);
  assert.equal(checkPath('server/.ENV.example'), null);
  assert.equal(checkPath('client/src/lib/API.ts'), null);
});

test('implementer paths: symlinks are resolved before the rules', () => {
  const root = mkdtempSync(join(tmpdir(), 'impl-guard-'));
  try {
    mkdirSync(join(root, '.claude'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, '.claude', 'settings.json'), '{}');
    symlinkSync(join(root, '.claude', 'settings.json'), join(root, 'src', 'link.json'));
    symlinkSync(tmpdir(), join(root, 'src', 'out'));
    assert.match(checkPath('src/link.json', root), /\.claude/);
    assert.match(checkPath('src/out/x.ts', root), /outside/);
    assert.equal(checkPath('src/ok.ts', root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('stdin: blocked → 2, allowed → 0, bad JSON → 2', () => {
  const run = (input) => spawnSync('node', [GUARD], { input, env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } }).status;
  assert.equal(run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: "bash -c 'git push'" }, cwd: ROOT })), 2);
  assert.equal(run(JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '.claude/x.md' } })), 2);
  assert.equal(run(JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'server/src/x.ts' } })), 0);
  assert.equal(run('not json'), 2);
  assert.equal(run(''), 2);
});
