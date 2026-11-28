import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient, UnsafeClonePathError } from '../src/adapters/git/simple-git.js';

/**
 * S1 (security hardening) — the adapter's own line of defence:
 * clone paths stay inside cloneDir, and the GitHub token never lands in a
 * clone's `.git/config`.
 */

const GIT = 'git';
const run = (cwd: string, ...args: string[]) =>
  execFileSync(GIT, args, { cwd, stdio: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    .toString()
    .trim();

let work: string;
let cloneDir: string;
let upstream: string;

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'dd-git-safety-'));
  cloneDir = join(work, 'clones');
  upstream = join(work, 'upstream');
  await mkdir(upstream);
  run(upstream, 'init', '-q', '-b', 'main');
  run(upstream, 'config', 'user.email', 't@example.com');
  run(upstream, 'config', 'user.name', 't');
  await writeFile(join(upstream, 'README.md'), 'hello\n');
  run(upstream, 'add', '.');
  run(upstream, 'commit', '-q', '-m', 'init');
});

afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

describe('SimpleGitClient.clonePathFor', () => {
  const client = () => new SimpleGitClient('/tmp/dd-clones');

  it('maps owner/name under cloneDir', () => {
    expect(client().clonePathFor({ owner: 'acme', name: 'widgets' })).toBe('/tmp/dd-clones/acme/widgets');
  });

  it.each([
    { owner: '..', name: 'node_modules' },
    { owner: 'acme', name: '..' },
    { owner: '.', name: 'x' },
    { owner: 'a/b', name: 'c' },
    { owner: 'acme', name: '../../etc' },
    { owner: '', name: 'x' },
    { owner: 'acme', name: 'x\0y' },
  ])('throws for %o before touching the filesystem', (ref) => {
    expect(() => client().clonePathFor(ref)).toThrow(UnsafeClonePathError);
  });
});

describe('SimpleGitClient.clone', () => {
  it('clones with a token configured, without writing the token into .git/config', async () => {
    const token = 'ghp_TESTTOKENSHOULDNEVERPERSIST';
    const client = new SimpleGitClient(cloneDir, { getToken: async () => token });
    const { path } = await client.clone({ owner: 'acme', name: 'widgets' }, upstream, { depth: 1 });

    expect(path).toBe(join(cloneDir, 'acme', 'widgets'));
    expect(await readFile(join(path, 'README.md'), 'utf8')).toBe('hello\n');
    const config = await readFile(join(path, '.git', 'config'), 'utf8');
    expect(config).not.toContain(token);
    expect(config).not.toContain('extraHeader');
    expect(config).not.toContain('Authorization');
  });

  it('scrubs a PAT left in origin by a pre-S1 clone on the next fetch', async () => {
    const dest = join(cloneDir, 'legacy', 'repo');
    await mkdir(join(cloneDir, 'legacy'), { recursive: true });
    run(work, 'clone', '-q', upstream, dest);
    run(dest, 'remote', 'set-url', 'origin', 'https://x-access-token:ghp_OLD@github.com/legacy/repo.git');

    const client = new SimpleGitClient(cloneDir);
    // The fetch itself targets github.com and fails offline / without the
    // repo — the scrub must already have happened before that.
    await client.clone({ owner: 'legacy', name: 'repo' }, 'unused').catch(() => undefined);

    expect(run(dest, 'remote', 'get-url', 'origin')).toBe('https://github.com/legacy/repo.git');
  });

  it('never removes anything outside cloneDir for a traversal ref', async () => {
    const sentinel = join(work, 'sentinel');
    await mkdir(sentinel);
    const client = new SimpleGitClient(cloneDir);
    await expect(client.clone({ owner: '..', name: 'sentinel' }, upstream)).rejects.toThrow(UnsafeClonePathError);
    await expect(access(sentinel)).resolves.toBeUndefined();
  });
});

describe('SimpleGitClient.showFile (M3 contained blob read)', () => {
  const ref = { owner: 'show', name: 'repo' };
  let client: SimpleGitClient;
  let sha: string;

  beforeAll(async () => {
    const dest = join(cloneDir, 'show', 'repo');
    await mkdir(join(cloneDir, 'show'), { recursive: true });
    run(work, 'clone', '-q', upstream, dest);
    run(dest, 'config', 'user.email', 't@example.com');
    run(dest, 'config', 'user.name', 't');
    await mkdir(join(dest, 'specs'), { recursive: true });
    await writeFile(join(dest, 'specs', 'M3-x.md'), '# Spec\nDo the thing.\n');
    await writeFile(join(dest, '-dash.md'), 'dash\n');
    await writeFile(join(dest, 'big.md'), 'x'.repeat(70 * 1024));
    run(dest, 'config', 'core.symlinks', 'true');
    run(dest, 'add', '.');
    // A committed symlink (mode 120000) pointing out of the repo.
    const linkBlob = execFileSync(GIT, ['hash-object', '-w', '--stdin'], { cwd: dest, input: '../../../etc/passwd' })
      .toString()
      .trim();
    run(dest, 'update-index', '--add', '--cacheinfo', `120000,${linkBlob},specs/link.md`);
    run(dest, 'commit', '-q', '-m', 'spec');
    sha = run(dest, 'rev-parse', 'HEAD');
    client = new SimpleGitClient(cloneDir);
  });

  it('reads a regular file at a sha (full and abbreviated)', async () => {
    expect(await client.showFile(ref, sha, 'specs/M3-x.md')).toBe('# Spec\nDo the thing.\n');
    expect(await client.showFile(ref, sha.slice(0, 7), './specs/M3-x.md')).toBe('# Spec\nDo the thing.\n');
  });

  it.each([
    ['traversal', '../../etc/passwd'],
    ['traversal inside', 'specs/../../x.md'],
    ['absolute path', '/etc/passwd'],
    ['leading dash', '-dash.md'],
    ['.git segment', '.git/config'],
    ['NUL byte', 'specs/M3-x.md\0'],
    ['directory', 'specs'],
    ['missing file', 'specs/nope.md'],
    ['symlink', 'specs/link.md'],
  ])('returns null for %s', async (_label, path) => {
    expect(await client.showFile(ref, sha, path)).toBeNull();
  });

  it('returns null for an oversize blob, an unknown sha and a non-hex sha', async () => {
    expect(await client.showFile(ref, sha, 'big.md')).toBeNull();
    expect(await client.showFile(ref, sha, 'big.md', { maxBytes: 128 * 1024 })).toHaveLength(70 * 1024);
    expect(await client.showFile(ref, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'specs/M3-x.md')).toBeNull();
    expect(await client.showFile(ref, '--output=x', 'specs/M3-x.md')).toBeNull();
    expect(await client.showFile(ref, 'HEAD', 'specs/M3-x.md')).toBeNull();
  });
});

describe('SimpleGitClient.showFile — quoted / unicode paths', () => {
  // `safeBlobPath` refuses only absolute, NUL/backslash, leading `-`, `..` and
  // `.git` paths — a space or a non-ASCII name is a SAFE repo-relative path,
  // so the blob at the sha is expected to be returned (and nothing throws).
  const ref = { owner: 'show', name: 'unicode' };
  let client: SimpleGitClient;
  let sha: string;

  beforeAll(async () => {
    const dest = join(cloneDir, 'show', 'unicode');
    await mkdir(join(cloneDir, 'show'), { recursive: true });
    run(work, 'clone', '-q', upstream, dest);
    run(dest, 'config', 'user.email', 't@example.com');
    run(dest, 'config', 'user.name', 't');
    await mkdir(join(dest, 'docs'), { recursive: true });
    await writeFile(join(dest, 'docs', 'my plan.md'), '# Plan with space\n');
    await writeFile(join(dest, 'docs', 'план-специфікація.md'), '# Unicode plan\n');
    run(dest, 'add', '.');
    run(dest, 'commit', '-q', '-m', 'unicode specs');
    sha = run(dest, 'rev-parse', 'HEAD');
    client = new SimpleGitClient(cloneDir);
  });

  it('reads a file whose name contains a space', async () => {
    await expect(client.showFile(ref, sha, 'docs/my plan.md')).resolves.toBe('# Plan with space\n');
  });

  it('reads a file with a non-ASCII (Cyrillic) name without throwing', async () => {
    await expect(client.showFile(ref, sha, 'docs/план-специфікація.md')).resolves.toBe('# Unicode plan\n');
  });
});
