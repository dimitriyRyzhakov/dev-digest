import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { mockIntentLlm } from './helpers/intent.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const USERS_TS = [
  "import { db } from '../db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
].join('\n');

const VALID = {
  rule: 'Always use async/await instead of .then() chains',
  evidence_path: 'src/api/users.ts',
  evidence_snippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });',
  confidence: 0.91,
  category: '  Async   Style ',
};
const WRONG_PATH = {
  rule: 'Redis access goes through src/lib/redis.ts',
  evidence_path: 'src/lib/redis.ts',
  evidence_snippet: 'export const redis = new Redis(config.redisUrl);',
  confidence: 0.85,
};
const WRONG_SNIPPET = {
  rule: 'Route handlers return Result<T, ApiError>',
  evidence_path: 'src/api/users.ts',
  evidence_snippet: 'function handler(): Result<Item[], ApiError> {',
  confidence: 0.78,
};

const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

d('M2 conventions extractor (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let clone: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    clone = await mkdtemp(join(tmpdir(), 'dd-conventions-'));
    await mkdir(join(clone, 'src/api'), { recursive: true });
    await writeFile(join(clone, 'src/api/users.ts'), USERS_TS);
    await writeFile(join(clone, 'tsconfig.json'), '{ "compilerOptions": { "strict": true } }');
    // In the clone but never sent to the model: must never be cited as evidence.
    await writeFile(join(clone, '.env'), 'API_KEY=super-secret\nDB_URL=postgres://x');
  });
  afterAll(async () => {
    await pg?.stop();
    if (clone) await rm(clone, { recursive: true, force: true });
  });

  function appWith(candidates: unknown[] = [VALID, WRONG_PATH, WRONG_SNIPPET]) {
    const llm = new MockLLMProvider('openai', {
      structured: EMPTY_REVIEW,
      structuredBySchema: { ConventionExtraction: { candidates } },
    });
    const app = buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: 'diff --git a/x b/x' }),
        github: new MockGitHubClient(),
        llm: { openai: llm, openrouter: mockIntentLlm() },
      },
    });
    return { app, llm };
  }

  async function makeRepo(name: string, clonePath: string | null = clone) {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    // repo-intel rank → getConventionSamples() picks users.ts as a sample file.
    await pg.handle.db.insert(t.fileRank).values({
      repoId: repo!.id,
      filePath: 'src/api/users.ts',
      pagerank: 1,
      hotness: 0,
      rank: 1,
      percentile: 100,
    });
    return repo!;
  }

  it('extract: never grounds evidence in a clone file that was not sent to the model', async () => {
    const SECRET = {
      rule: 'Keep API keys in .env',
      evidence_path: '.env',
      evidence_snippet: 'API_KEY=super-secret',
      confidence: 0.9,
    };
    const { app: appP, llm } = appWith([VALID, SECRET]);
    const app = await appP;
    const repo = await makeRepo('secret-demo');
    const body = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    expect(body.dropped).toBe(1);
    expect(body.candidates.map((c: { evidence_path: string }) => c.evidence_path)).toEqual(['src/api/users.ts']);
    expect(JSON.stringify(body)).not.toContain('super-secret');
    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as { messages: { content: string }[] };
    expect(req.messages[1]!.content).not.toContain('super-secret');
    await app.close();
  });

  it('extract: one model call, grounds evidence, drops the rest; list returns them', async () => {
    const { app: appP, llm } = appWith();
    const app = await appP;
    const repo = await makeRepo('extract-demo');

    const empty = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    expect(empty).toEqual({ candidates: [], last_scan_at: null, sample_files: null });

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dropped).toBe(2);
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({
      rule: VALID.rule,
      evidence_path: 'src/api/users.ts',
      // 2-line match (4–5) widened with real context; blank line 2 trimmed.
      evidence_start_line: 3,
      evidence_end_line: 7,
      evidence_snippet: USERS_TS.split('\n').slice(2, 7).join('\n'),
      status: 'pending',
      accepted: false,
      // Model said 0.91, but only one provided file supports it → capped at 0.5.
      confidence: 0.5,
      // Model category normalized: trimmed, lowercase, single spaces.
      category: 'async style',
    });

    const structured = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structured).toHaveLength(1);
    const req = structured[0]!.req as { schemaName: string; messages: { content: string }[] };
    expect(req.schemaName).toBe('ConventionExtraction');
    expect(req.messages[1]!.content).toContain('<untrusted source="tsconfig.json">');

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    expect(list.candidates).toHaveLength(1);
    expect(list.last_scan_at).toBe(list.candidates[0].created_at);
    // tsconfig.json + src/api/users.ts were sent to the model.
    expect(list.sample_files).toBe(2);
    await app.close();
  });

  it('extract: unknown repo → 404; not cloned → 409', async () => {
    const app = await appWith().app;
    const missing = await app.inject({
      method: 'POST',
      url: '/repos/00000000-0000-4000-8000-000000000000/conventions/extract',
    });
    expect(missing.statusCode).toBe(404);
    const notCloned = await makeRepo('not-cloned', null);
    const res = await app.inject({ method: 'POST', url: `/repos/${notCloned.id}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('repo_not_cloned');
    await app.close();
  });

  it('PATCH edits rule/status; re-scan keeps accepted, drops pending, adds no duplicate', async () => {
    const app = await appWith().app;
    const repo = await makeRepo('rescan-demo');
    const first = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    const id = first.candidates[0].id;

    const edited = await app.inject({
      method: 'PATCH',
      url: `/conventions/${id}`,
      payload: { rule: 'Use async/await, never .then() chains', status: 'accepted' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ rule: 'Use async/await, never .then() chains', status: 'accepted', accepted: true });

    expect((await app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload: {} })).statusCode).toBe(422);
    expect(
      (await app.inject({
        method: 'PATCH',
        url: '/conventions/00000000-0000-4000-8000-000000000000',
        payload: { status: 'rejected' },
      })).statusCode,
    ).toBe(404);

    // Re-scan: the model returns the edited accepted rule again + a new grounded one.
    const second = {
      ...VALID,
      rule: 'use async/await,  never .then() chains.',
    };
    const fresh = {
      rule: 'Import the db from ../db',
      evidence_path: 'src/api/users.ts',
      evidence_snippet: "import { db } from '../db';",
      confidence: 0.6,
    };
    const app2 = await appWith([second, fresh]).app;
    const rescan = (await app2.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    expect(rescan.candidates.map((c: { rule: string }) => c.rule).sort()).toEqual(
      ['Import the db from ../db', 'Use async/await, never .then() chains'].sort(),
    );
    expect(rescan.candidates.find((c: { id: string }) => c.id === id).status).toBe('accepted');
    await app.close();
    await app2.close();
  });

  it('skill: 422 without accepted; creates convention/extracted, re-save bumps version; manual name → 409', async () => {
    const app = await appWith().app;
    const repo = await makeRepo('skill-demo');
    const payload = {
      name: 'skill-demo-conventions',
      description: '1 house convention extracted from skill-demo',
      body: '# skill-demo-conventions\n\nAlways use async/await.',
      enabled: true,
    };

    const none = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill`, payload });
    expect(none.statusCode).toBe(422);

    const { candidates } = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    await app.inject({ method: 'PATCH', url: `/conventions/${candidates[0].id}`, payload: { status: 'accepted' } });

    const created = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill`, payload });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      name: 'skill-demo-conventions',
      type: 'convention',
      source: 'extracted',
      enabled: true,
      version: 1,
      evidence_files: ['src/api/users.ts'],
    });

    const updated = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill`,
      payload: { ...payload, body: `${payload.body}\n\nEdited.`, enabled: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ id: skill.id, version: 2, enabled: false, source: 'extracted' });

    await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'hand-written', description: 'Flag X.', type: 'rubric', body: 'Body' },
    });
    const clash = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill`,
      payload: { ...payload, name: 'hand-written' },
    });
    expect(clash.statusCode).toBe(409);

    const unknown = await app.inject({
      method: 'POST',
      url: '/repos/00000000-0000-4000-8000-000000000000/conventions/skill',
      payload,
    });
    expect(unknown.statusCode).toBe(404);
    await app.close();
  });

  it('the extracted skill linked to an agent shows up in the run trace skill blocks', async () => {
    const { app: appP, llm } = appWith();
    const app = await appP;
    const db = pg.handle.db;
    const repo = await makeRepo('trace-demo');
    const { candidates } = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    await app.inject({ method: 'PATCH', url: `/conventions/${candidates[0].id}`, payload: { status: 'accepted' } });
    const skill = (
      await app.inject({
        method: 'POST',
        url: `/repos/${repo.id}/conventions/skill`,
        payload: {
          name: 'trace-demo-conventions',
          description: 'House conventions of trace-demo',
          body: 'CONVENTIONS-BODY: always use async/await.',
          enabled: true,
        },
      })
    ).json();

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Conventions Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'AGENT-SYS' },
      })
    ).json();
    const linked = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: skill.id, enabled: true }] },
    });
    expect(linked.statusCode).toBe(200);

    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 11,
        title: 'Change users',
        author: 'dev',
        branch: 'feat/users',
        base: 'main',
        headSha: 'def456',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(db, pr!.id, { expected: 1 });

    const review = llm.calls.filter((c) => c.method === 'completeStructured').at(-1)!;
    const system = (review.req as { messages: { content: string }[] }).messages[0]!.content;
    expect(system).toContain('CONVENTIONS-BODY');

    const runId = res.json().runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.skill_blocks).toEqual([
      expect.objectContaining({ skill_id: skill.id, name: 'trace-demo-conventions' }),
    ]);
    await app.close();
  });
});
