import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SmartDiff } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let seq = 0;

d('M3 smart diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith() {
    const llm = new MockLLMProvider('openai', { structured: { verdict: 'approve', summary: 'ok', score: 100, findings: [] } });
    const appP = buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        github: new MockGitHubClient(),
        llm: { openai: llm, openrouter: llm, anthropic: llm },
      },
    });
    return { appP, llm };
  }

  async function setupPr(ws = workspaceId) {
    const name = `smart-diff-${seq++}`;
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rate-limit',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 0,
        deletions: 0,
        filesCount: 4,
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/limiter.ts', additions: 12, deletions: 3 },
      { prId: pr!.id, path: 'pnpm-lock.yaml', additions: 200, deletions: 50 },
      { prId: pr!.id, path: 'README.md', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/a.test.ts', additions: 30, deletions: 1 },
    ]);
    return pr!;
  }

  async function addReview(
    ws: string,
    prId: string,
    opts: { agentId: string | null; kind?: 'review' | 'summary'; createdAt: Date },
    findings: { file: string; startLine: number; dismissed?: boolean }[],
  ) {
    const db = pg.handle.db;
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId: ws, prId, agentId: opts.agentId, kind: opts.kind ?? 'review', createdAt: opts.createdAt })
      .returning();
    if (findings.length === 0) return;
    await db.insert(t.findings).values(
      findings.map((f) => ({
        reviewId: review!.id,
        file: f.file,
        startLine: f.startLine,
        endLine: f.startLine,
        severity: 'WARNING',
        category: 'correctness',
        title: 'x',
        rationale: 'y',
        confidence: 0.9,
        dismissedAt: f.dismissed ? new Date() : null,
      })),
    );
  }

  const fileOf = (diff: SmartDiff, path: string) => diff.groups.flatMap((g) => g.files).find((f) => f.path === path);

  it('groups files before any review, then fills finding_lines from the newest review per agent', async () => {
    const { appP, llm } = appWith();
    const app = await appP;
    const pr = await setupPr();

    const before = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(before.statusCode).toBe(200);
    const first = SmartDiff.parse(before.json());
    expect(first.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(first.groups.map((g) => g.files.map((f) => f.path))).toEqual([
      ['src/limiter.ts'],
      ['src/a.test.ts'],
      [],
      ['README.md'],
      ['pnpm-lock.yaml'],
    ]);
    expect(first.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
    expect(first.split_suggestion).toEqual({ too_big: false, total_lines: 300, proposed_splits: [] });

    const agentA = randomUUID();
    const agentB = randomUUID();
    await addReview(workspaceId, pr.id, { agentId: agentA, createdAt: new Date('2026-11-27T10:00:00Z') }, [
      { file: 'src/limiter.ts', startLine: 2 },
    ]);
    await addReview(workspaceId, pr.id, { agentId: agentA, createdAt: new Date('2026-11-28T10:00:00Z') }, [
      { file: 'src/limiter.ts', startLine: 9 },
      { file: 'src/limiter.ts', startLine: 5 },
      { file: 'src/limiter.ts', startLine: 7, dismissed: true },
    ]);
    await addReview(workspaceId, pr.id, { agentId: agentB, createdAt: new Date('2026-11-28T09:00:00Z') }, [
      { file: 'src/limiter.ts', startLine: 5 },
      { file: 'src/a.test.ts', startLine: 4 },
    ]);
    await addReview(
      workspaceId,
      pr.id,
      { agentId: null, kind: 'summary', createdAt: new Date('2026-11-29T10:00:00Z') },
      [{ file: 'README.md', startLine: 1 }],
    );

    const after = SmartDiff.parse((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })).json());
    expect(fileOf(after, 'src/limiter.ts')!.finding_lines).toEqual([5, 9]);
    expect(fileOf(after, 'src/a.test.ts')!.finding_lines).toEqual([4]);
    expect(fileOf(after, 'README.md')!.finding_lines).toEqual([]);
    expect(fileOf(after, 'pnpm-lock.yaml')!.finding_lines).toEqual([]);

    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('404 envelope for a PR of another workspace and for an unknown id', async () => {
    const { appP, llm } = appWith();
    const app = await appP;
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq}` }).returning();
    const foreign = await setupPr(otherWs!.id);

    const res = await app.inject({ method: 'GET', url: `/pulls/${foreign.id}/smart-diff` });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'not_found' } });

    const unknown = await app.inject({ method: 'GET', url: '/pulls/00000000-0000-4000-8000-000000000000/smart-diff' });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ error: { code: 'not_found' } });

    const bad = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    expect(bad.statusCode).toBeLessThan(500);

    expect(llm.calls).toHaveLength(0);
    await app.close();
  });
});
