import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { INTENT_CLASSIFICATION, mockIntentLlm } from './helpers/intent.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { IntentService } from '../src/modules/intent/service.js';
import { IntentRepository } from '../src/modules/intent/repository.js';
import { readContainedFile } from '../src/platform/contained-read.js';
import type { PrIntentRecord, Review, RunTrace, StructuredRequest, StructuredResult } from '@devdigest/shared';

/** Hangs forever on the intent classifier call; review calls behave like the mock. */
class HangingIntentLlm extends MockLLMProvider {
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (req.schemaName === 'PrIntentClassification') {
      this.calls.push({ method: 'completeStructured', req });
      return new Promise<StructuredResult<T>>(() => undefined);
    }
    return super.completeStructured(req);
  }
}

/** A modified file with `n` added lines (new-side lines 2..n+1). */
function bigFileDiff(path: string, n: number): string {
  const added = Array.from({ length: n }, (_, i) => `+export const v${i} = ${i};`).join('\n');
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,${n + 1} @@\n export {};\n${added}`;
}

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/auth/limiter.ts b/src/auth/limiter.ts
--- a/src/auth/limiter.ts
+++ b/src/auth/limiter.ts
@@ -1,2 +1,3 @@
 export const limit = 10;
+export const burst = 20;
 export default limit;`;

const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

const BODY =
  'Adds rate limiting to the public API so abusive clients get throttled before they reach the database layer. ' +
  'Closes #471. Plan: specs/M3-x.md. Tracking: https://linear.app/acme/issue/PAY-1';

let seq = 0;

d('M3 intent layer (Testcontainers pg)', () => {
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

  function appWith(
    opts: { intent?: MockLLMProvider; review?: MockLLMProvider; diff?: string; filesAtSha?: Record<string, string> } = {},
  ) {
    const intent = opts.intent ?? mockIntentLlm();
    const review = opts.review ?? new MockLLMProvider('openai', { structured: EMPTY_REVIEW });
    const git = new MockGitClient({
      diff: opts.diff ?? DIFF,
      filesAtSha: opts.filesAtSha ?? { 'specs/M3-x.md': '# M3\nIn scope: public API only.' },
    });
    const appP = buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git,
        github: new MockGitHubClient(),
        llm: { openai: review, openrouter: intent },
      },
    });
    return { appP, intent, review, git };
  }

  async function setupPr(body: string | null, opts: { clonePath?: string } = {}) {
    const name = `intent-api-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        ...(opts.clonePath ? { clonePath: opts.clonePath } : {}),
      })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rate-limit',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body,
      })
      .returning();
    return { repo: repo!, pr: pr! };
  }

  async function createAgent(app: Awaited<ReturnType<typeof buildApp>>, name: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json() as { id: string };
  }

  async function runOnce(app: Awaited<ReturnType<typeof buildApp>>, prId: string, agentId: string) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    const runs = await waitForPrRuns(pg.handle.db, prId);
    return { runId, runs };
  }

  const intentCalls = (llm: MockLLMProvider) =>
    llm.calls.filter(
      (c) => c.method === 'completeStructured' && (c.req as { schemaName: string }).schemaName === 'PrIntentClassification',
    );

  it('(a, e) ticket + spec + Linear link → intent in prompt, trace and GET route', async () => {
    const { appP, intent, git } = appWith();
    const app = await appP;
    const { pr } = await setupPr(BODY);

    const before = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toEqual({ intent: null });

    const agent = await createAgent(app, `Intent A ${seq}`);
    const { runId } = await runOnce(app, pr.id, agent.id);

    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(intentCalls(intent)).toHaveLength(1);
    // Only the code-parsed spec path was read at the PR head sha.
    expect(git.shown).toEqual([{ sha: 'a1b2c3d4', path: 'specs/M3-x.md' }]);

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
    expect(trace.prompt_assembly.user).toContain('<untrusted source="pr-intent">');
    expect(trace.prompt_assembly.intent).toContain('## PR intent (derived from PR text — untrusted)');
    expect(trace.intent).toMatchObject({ category: 'feat', confidence_level: 'high', cached: false });
    expect(trace.intent!.risk_areas).toContainEqual({ kind: 'auth', label: 'Auth surface touched', origin: 'code' });
    expect(trace.specs_read).toEqual(['specs/M3-x.md']);
    const log = trace.log.map((l) => l.msg).join('\n');
    expect(log).toContain('Intent: ticket #471 fetched ("Issue #471")');
    expect(log).toContain('Intent: spec specs/M3-x.md read @a1b2c3d');
    expect(log).toContain('Intent: warning — unresolved ref https://linear.app/acme/issue/PAY-1');
    expect(log).toMatch(/Intent: feat · confidence high/);

    const after = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(after.intent).toMatchObject({
      pr_id: pr.id,
      intent: INTENT_CLASSIFICATION.summary,
      category: 'feat',
      confidence_level: 'high',
      confidence: 0.8,
      documented: true,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      head_sha: 'a1b2c3d4',
    });
    expect(after.intent.unresolved_refs).toContainEqual(
      expect.objectContaining({ kind: 'link', host: 'linear.app', reason: 'external_host' }),
    );

    const unknown = await app.inject({ method: 'GET', url: '/pulls/00000000-0000-4000-8000-000000000000/intent' });
    expect(unknown.statusCode).toBe(404);
    await app.close();
  });

  it('(b) cache hit: one intent LLM call across two runs', async () => {
    const { appP, intent } = appWith();
    const app = await appP;
    const { pr } = await setupPr(BODY);
    const agent = await createAgent(app, `Intent B ${seq}`);
    await runOnce(app, pr.id, agent.id);
    const { runId } = await runOnce(app, pr.id, agent.id);
    expect(intentCalls(intent)).toHaveLength(1);
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
    expect(trace.intent?.cached).toBe(true);
    expect(trace.log.map((l) => l.msg).join('\n')).toMatch(/Intent cached \(hash [0-9a-f]{8}/);
    await app.close();
  });

  it('(c) invalid intent output → the review is still done, log has "Intent failed"', async () => {
    const { appP } = appWith({ intent: mockIntentLlm({ not: 'an intent' }) });
    const app = await appP;
    const { pr } = await setupPr(BODY);
    const agent = await createAgent(app, `Intent C ${seq}`);
    const { runId } = await runOnce(app, pr.id, agent.id);
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
    expect(trace.log.some((l) => l.kind === 'error' && l.msg.startsWith('Intent failed — continuing review without intent:'))).toBe(true);
    expect(trace.intent ?? null).toBeNull();
    expect(trace.prompt_assembly.intent ?? null).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('pr-intent');
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json()).toEqual({ intent: null });
    await app.close();
  });

  it('(d) no body → low confidence, capped at 0.4', async () => {
    const { appP } = appWith();
    const app = await appP;
    const { pr } = await setupPr(null);
    const agent = await createAgent(app, `Intent D ${seq}`);
    const { runId } = await runOnce(app, pr.id, agent.id);
    const got = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(got.intent).toMatchObject({ confidence_level: 'low', confidence: 0.4, documented: false });
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
    expect(trace.log.map((l) => l.msg).join('\n')).toContain('Intent: no description/ticket/spec');
    expect(trace.prompt_assembly.intent).toContain('Confidence: LOW');
    await app.close();
  });

  it('(f) one run request with several agents → one intent call, its lines in every run log', async () => {
    const { appP, intent } = appWith();
    const app = await appP;
    const { pr } = await setupPr(BODY);
    await createAgent(app, `Intent F1 ${seq}`);
    await createAgent(app, `Intent F2 ${seq}`);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } });
    expect(res.statusCode).toBe(200);
    const runIds = (res.json().runs as { run_id: string }[]).map((r) => r.run_id);
    expect(runIds.length).toBeGreaterThanOrEqual(2);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: runIds.length });
    expect(intentCalls(intent)).toHaveLength(1);
    for (const runId of runIds) {
      const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
      expect(trace.log.map((l) => l.msg).join('\n')).toContain('Intent: sources — title');
    }
    await app.close();
  });

  it('(g) map-reduce: a large multi-file diff → every chunk request carries the pr-intent block', async () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
    const diff = files.map((f) => bigFileDiff(f, 200)).join('\n');
    const { appP, review } = appWith({ diff });
    const app = await appP;
    const { pr } = await setupPr(BODY);
    // strategy 'auto' → map-reduce only because the diff is > 400 lines AND multi-file.
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Intent G ${seq}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review', strategy: 'auto' },
      })
    ).json() as { id: string };
    const { runId } = await runOnce(app, pr.id, agent.id);

    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    const reviewCalls = review.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => c.req as { schemaName: string; messages: { role: string; content: string }[] })
      .filter((r) => r.schemaName === 'Review');
    expect(reviewCalls).toHaveLength(files.length);
    for (const req of reviewCalls) {
      expect(req.messages[1]!.content).toContain('<untrusted source="pr-intent">');
    }
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
    expect(trace.tool_calls.map((c) => c.args)).toEqual(files);
    expect(trace.tool_calls.every((c) => c.meta === 'map-reduce')).toBe(true);
    await app.close();
  });

  it('(h) spec missing at headSha → read from the working tree via readContainedFile', async () => {
    const clone = await mkdtemp(join(tmpdir(), 'dd-intent-wt-'));
    try {
      await mkdir(join(clone, 'specs'), { recursive: true });
      await writeFile(join(clone, 'specs', 'M3-x.md'), '# M3 (working tree)\nIn scope: public API only.\n');
      // No blob at the head sha: MockGitClient.showFile returns null for every path.
      const { appP, git } = appWith({ filesAtSha: {} });
      const app = await appP;
      const { pr } = await setupPr(BODY, { clonePath: clone });
      const agent = await createAgent(app, `Intent H ${seq}`);
      const { runId } = await runOnce(app, pr.id, agent.id);

      expect(git.shown).toEqual([{ sha: 'a1b2c3d4', path: 'specs/M3-x.md' }]);
      const got = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json() as {
        intent: PrIntentRecord;
      };
      expect(got.intent.sources).toContainEqual(
        expect.objectContaining({ kind: 'spec', ref: 'specs/M3-x.md', via: 'worktree', truncated: false }),
      );
      const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
      expect(trace.specs_read).toEqual(['specs/M3-x.md']);
      expect(trace.log.map((l) => l.msg).join('\n')).toContain(
        'Intent: spec specs/M3-x.md read from working tree (head not in clone)',
      );
      await app.close();
    } finally {
      await rm(clone, { recursive: true, force: true });
    }
  });

  it('(i) classifier never resolves → times out, the review run is still done without intent', async () => {
    const { appP } = appWith();
    const app = await appP;
    const container = app.container;
    const { pr } = await setupPr(BODY);
    const created = await createAgent(app, `Intent I ${seq}`);

    const hanging = new HangingIntentLlm('openai');
    const git = new MockGitClient({ filesAtSha: {} });
    const intentService = new IntentService({
      store: new IntentRepository(pg.handle.db),
      github: async () => new MockGitHubClient(),
      showFile: (repo, sha, path) => git.showFile(repo, sha, path),
      readFile: readContainedFile,
      resolveModel: async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }),
      llm: async () => hanging,
      timeoutMs: 50,
    });
    const repo = new ReviewRepository(pg.handle.db);
    const executor = new ReviewRunExecutor(container, repo, container.agentsRepo, intentService);

    const pull = (await repo.getPull(workspaceId, pr.id))!;
    const repoRow = (await repo.getRepo(pull.repoId))!;
    const agent = (await container.agentsRepo.getById(workspaceId, created.id))!;
    const runId = await repo.createAgentRun({
      workspaceId,
      agentId: agent.id,
      prId: pr.id,
      provider: agent.provider,
      model: agent.model,
    });

    const started = Date.now();
    await executor.executeRuns(workspaceId, pull, repoRow, [{ agent, runId }]);
    expect(Date.now() - started).toBeLessThan(5_000);

    expect(hanging.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
    const failed = trace.log.find(
      (l) => l.kind === 'error' && l.msg.startsWith('Intent failed — continuing review without intent:'),
    );
    expect(failed?.msg).toContain('Intent classification timed out after 50ms');
    expect(trace.intent ?? null).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('pr-intent');
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json()).toEqual({ intent: null });
    await app.close();
  });
});
