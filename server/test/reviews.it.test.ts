import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { completeAgentRun } from '../src/modules/reviews/repository/run.repo.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A unified diff touching src/config.ts (line 11 added) so grounding can keep a
 * finding on line 11 and drop one on line 999 / a non-existent file.
 */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture: one valid finding (line 11), one hallucinated (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
    })
    .returning();
  // persist the patch so the reviewer can reconstruct a diff (MockGit also returns one)
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('A2 reviews + agents (Testcontainers pg)', () => {
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

  function appWith(structured: unknown, provider: 'openai' | 'anthropic' = 'openai') {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          [provider]: new MockLLMProvider(provider, { structured }),
        },
      },
    });
  }

  it('agents CRUD', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Test Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agent = created.json();
    expect(agent.version).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(list.some((a: { id: string }) => a.id === agent.id)).toBe(true);

    // a config change bumps version
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'Updated prompt.' },
      })
    ).json();
    expect(updated.version).toBe(2);

    await app.close();
  });

  it('runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(1);

    // runReview is fire-and-forget: wait for the background run, then read the
    // persisted reviews (the POST returns runIds, not the reviews themselves).
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews).toHaveLength(1);

    const review = reviews[0];
    expect(review.verdict).toBe('request_changes');
    // Score is derived from the GROUNDED findings, not the model's self-reported
    // 42: grounding keeps one CRITICAL (line 11) ⇒ 100 − 35 = 65.
    expect(review.score).toBe(65);
    // grounding kept only the valid finding (line 11), dropped the line-999 one
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].file).toBe('src/config.ts');
    expect(review.findings[0].start_line).toBe(11);

    // a run_traces document was written (single doc)
    const runId = body.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.config.model).toBe('gpt-4.1');
    expect(trace.stats.grounding).toBe('1/2 passed');
    expect(trace.log.length).toBeGreaterThan(0);

    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');

    // M1 — run cost persisted from the engine's usage (MockLLM: $0.001/call),
    // mirrored into the trace stats and exposed on the runs history route.
    expect(run!.costUsd).toBeGreaterThan(0);
    expect(trace.stats.cost_usd).toBeCloseTo(run!.costUsd!, 10);
    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs[0].cost_usd).toBeCloseTo(run!.costUsd!, 10);

    await app.close();
  });

  it('M1: a FAILED review run stores cost_usd = null (trace, runs history, PR list)', async () => {
    // A fixture that fails the Review schema makes the mock LLM throw → run fails.
    const app = await appWith({ not: 'a review' });
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Broken', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('failed');
    expect(run!.costUsd).toBeNull();

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.stats.cost_usd ?? null).toBeNull();

    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs[0].status).toBe('failed');
    expect(runs[0].cost_usd).toBeNull();

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    expect(list[0].cost_usd).toBeNull();

    await app.close();
  });

  it('M1: completing a run as cancelled/failed without a cost clears any stored cost_usd', async () => {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    for (const status of ['cancelled', 'failed'] as const) {
      // Seed a stale non-null cost so the assertion proves an overwrite, not a default.
      const [row] = await pg.handle.db
        .insert(t.agentRuns)
        .values({ workspaceId, prId: pr.id, status: 'running', costUsd: 0.7 })
        .returning({ id: t.agentRuns.id });

      await completeAgentRun(pg.handle.db, row!.id, {
        status,
        durationMs: 10,
        tokensIn: 0,
        tokensOut: 0,
        findingsCount: 0,
        grounding: '0/0 passed',
        error: status === 'cancelled' ? 'Cancelled by user' : 'boom',
      });

      const [after] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, row!.id));
      expect(after!.status).toBe(status);
      expect(after!.costUsd).toBeNull();
    }
  });

  it('M1: PR list COST = total of ALL finished runs; skips null costs; null without one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { pr: bare } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const at = (iso: string) => new Date(iso);
    await pg.handle.db.insert(t.agentRuns).values([
      // two done runs (different agents / re-runs) → summed
      { workspaceId, prId: pr.id, ranAt: at('2026-06-01T10:00:00Z'), status: 'done', costUsd: 0.001 },
      { workspaceId, prId: pr.id, ranAt: at('2026-06-01T11:00:00Z'), status: 'done', costUsd: 0.002 },
      // done but unpriced (pre-M1 / unknown model) → skipped
      { workspaceId, prId: pr.id, ranAt: at('2026-06-01T11:30:00Z'), status: 'done', costUsd: null },
      // failed / cancelled → not counted even with a cost
      { workspaceId, prId: pr.id, ranAt: at('2026-06-01T12:00:00Z'), status: 'failed', costUsd: 9 },
      { workspaceId, prId: pr.id, ranAt: at('2026-06-01T12:30:00Z'), status: 'cancelled', costUsd: 9 },
      // PR in the other repo: only a failed run
      { workspaceId, prId: bare.id, ranAt: at('2026-06-01T12:00:00Z'), status: 'failed', costUsd: null },
    ]);

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const row = list.find((p: { number: number }) => p.number === pr.number);
    expect(row.cost_usd).toBeCloseTo(0.003, 10);

    const bareRepoId = (
      await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, bare.id))
    )[0]!.repoId;
    const bareList = (await app.inject({ method: 'GET', url: `/repos/${bareRepoId}/pulls` })).json();
    expect(bareList[0].cost_usd).toBeNull();

    await app.close();
  });

  it('M1: PR list FINDINGS = latest review of EACH agent (counts + sorted preview)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { repo: cleanRepo, pr: clean } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { repo: newRepo } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const SEC = '00000000-0000-4000-8000-0000000000a1';
    const PERF = '00000000-0000-4000-8000-0000000000a2';
    const at = (iso: string) => new Date(iso);
    const review = async (agentId: string | null, createdAt: string, prId = pr.id) =>
      (
        await pg.handle.db
          .insert(t.reviews)
          .values({ workspaceId, prId, agentId, kind: 'review', score: 50, createdAt: at(createdAt) })
          .returning()
      )[0]!;
    const finding = (reviewId: string, severity: string, title: string, confidence = 0.9, dismissed = false) => ({
      reviewId,
      severity,
      title,
      confidence,
      category: 'bug',
      file: 'src/a.ts',
      startLine: 1,
      endLine: 2,
      rationale: `why ${title}`,
      dismissedAt: dismissed ? new Date() : null,
    });

    const secOld = await review(SEC, '2026-06-01T09:00:00Z');
    const secNew = await review(SEC, '2026-06-01T10:00:00Z');
    const perf = await review(PERF, '2026-06-01T10:30:00Z');
    const legacy = await review(null, '2026-06-01T08:00:00Z');
    await review(SEC, '2026-06-01T10:00:00Z', clean.id); // reviewed, zero findings
    await pg.handle.db.insert(t.findings).values([
      finding(secOld.id, 'CRITICAL', 'old crit (superseded)'),
      finding(secNew.id, 'CRITICAL', 'crit', 0.95),
      finding(secNew.id, 'WARNING', 'warn dismissed', 0.8, true), // dismissed still counts
      finding(perf.id, 'WARNING', 'warn perf', 0.9),
      finding(perf.id, 'SUGGESTION', 'sugg a', 0.7),
      finding(perf.id, 'SUGGESTION', 'sugg b', 0.6),
      finding(legacy.id, 'SUGGESTION', 'legacy sugg', 0.5),
    ]);

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const row = list.find((p: { id: string }) => p.id === pr.id);
    expect(row.finding_counts).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 3 });
    expect(row.findings_preview.map((f: { title: string }) => f.title)).toEqual([
      'crit',
      'warn perf',
      'warn dismissed',
      'sugg a',
      'sugg b',
    ]);
    expect(row.findings_preview[0]).toMatchObject({ severity: 'CRITICAL', file: 'src/a.ts', start_line: 1, end_line: 2 });

    const cleanRow = (await app.inject({ method: 'GET', url: `/repos/${cleanRepo.id}/pulls` })).json()[0];
    expect(cleanRow.finding_counts).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(cleanRow.findings_preview).toEqual([]);

    const neverRow = (await app.inject({ method: 'GET', url: `/repos/${newRepo.id}/pulls` })).json()[0];
    expect(neverRow.finding_counts).toBeNull();
    expect(neverRow.findings_preview).toBeNull();

    await app.close();
  });

  it('dual-provider structured output: anthropic provider returns the same Review shape', async () => {
    const app = await appWith(REVIEW_FIXTURE, 'anthropic');
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Claude Rev', provider: 'anthropic', model: 'claude-x', system_prompt: 'rev' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].model).toBe('claude-x');
    await app.close();
  });

  it('finding actions: accept, dismiss', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ActAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    const findingId = reviews[0].findings[0].id;

    const accepted = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })
    ).json();
    expect(accepted.finding.accepted_at).not.toBeNull();

    const dismissed = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` })
    ).json();
    expect(dismissed.finding.dismissed_at).not.toBeNull();
    expect(dismissed.finding.accepted_at).toBeNull();

    await app.close();
  });

  it('SSE: /runs/:id/events streams events and completes', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SseAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // The run is synchronous; events are buffered on the bus. Subscribing after
    // the run still replays the buffer (replay-first semantics), then completes.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = body.runs[0].run_id;

    const sse = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    // The replay buffer should contain our log lines as SSE `data:` frames.
    expect(sse.payload).toContain('Starting review');
    expect(sse.payload).toContain('Citation grounding');
    await app.close();
  });

  it('run all enabled agents reviews with each enabled agent', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    // seed has 2 enabled agents; we may have created more above in this PR's ws.
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });
});
