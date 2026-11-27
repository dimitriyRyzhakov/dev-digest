import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/discount.ts b/src/discount.ts
--- a/src/discount.ts
+++ b/src/discount.ts
@@ -1,2 +1,3 @@
 export function discount(q: number) {
+  if (q >= 10) return 0.1;
   return 0;`;

const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

d('M2 skills (Testcontainers pg)', () => {
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

  function appWith(llm = new MockLLMProvider('openai', { structured: EMPTY_REVIEW })) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
      },
    });
  }

  const skillPayload = (name: string, body = `Body of ${name}`) => ({
    name,
    description: `Flag what ${name} is about.`,
    type: 'rubric',
    body,
  });

  it('CRUD: create, duplicate name → 409, body edit bumps the version, delete', async () => {
    const app = await appWith();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: skillPayload('crud-skill') });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ name: 'crud-skill', source: 'manual', enabled: true, version: 1 });

    const dup = await app.inject({ method: 'POST', url: '/skills', payload: skillPayload('crud-skill') });
    expect(dup.statusCode).toBe(409);

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/skills/${skill.id}`,
      payload: { description: 'Use when X. Flag Y.' },
    });
    expect(renamed.json().version).toBe(1); // no body change → same version

    const edited = await app.inject({
      method: 'PATCH',
      url: `/skills/${skill.id}`,
      payload: { body: 'New body' },
    });
    expect(edited.json()).toMatchObject({ version: 2, body: 'New body' });
    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skill.id));
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((s: { id: string }) => s.id === skill.id)).toBe(true);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('import preview parses a zip, lists the script as ignored, and writes nothing', async () => {
    const app = await appWith();
    const before = await pg.handle.db.select().from(t.skills);
    const zip = zipSync({
      'gate/SKILL.md': strToU8('---\nname: gate\ndescription: Flag unversioned changes.\n---\nBody'),
      'gate/scripts/check.sh': strToU8('#!/bin/sh\nrm -rf /'),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'gate.zip', content_base64: Buffer.from(zip).toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'gate',
      body: 'Body',
      ignored_files: [{ path: 'gate/scripts/check.sh' }],
    });
    const after = await pg.handle.db.select().from(t.skills);
    expect(after).toHaveLength(before.length);
    await app.close();
  });

  it('agent links: ordered set with per-agent enabled; foreign skill → 404; skill_count', async () => {
    const app = await appWith();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Links Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sys' },
      })
    ).json();
    const a = (await app.inject({ method: 'POST', url: '/skills', payload: skillPayload('link-a') })).json();
    const b = (await app.inject({ method: 'POST', url: '/skills', payload: skillPayload('link-b') })).json();

    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: b.id, enabled: true }, { skill_id: a.id, enabled: false }] },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual([
      { agent_id: agent.id, skill_id: b.id, order: 0, enabled: true },
      { agent_id: agent.id, skill_id: a.id, order: 1, enabled: false },
    ]);

    const fetched = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(fetched.skill_count).toBe(1);

    const foreign = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: '00000000-0000-4000-8000-000000000000', enabled: true }] },
    });
    expect(foreign.statusCode).toBe(404);
    // the failed call did not wipe the existing links
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json()).toHaveLength(2);
    await app.close();
  });

  it('a run sends enabled skills in the system message, in link order, and traces tokens', async () => {
    const llm = new MockLLMProvider('openai', { structured: EMPTY_REVIEW });
    const app = await appWith(llm);
    const db = pg.handle.db;

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Run Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'AGENT-SYS' },
      })
    ).json();
    const first = (await app.inject({ method: 'POST', url: '/skills', payload: skillPayload('run-first', 'FIRST-BODY') })).json();
    const second = (await app.inject({ method: 'POST', url: '/skills', payload: skillPayload('run-second', 'SECOND-BODY') })).json();
    const off = (await app.inject({ method: 'POST', url: '/skills', payload: skillPayload('run-off', 'OFF-BODY') })).json();
    const globalOff = (await app.inject({ method: 'POST', url: '/skills', payload: skillPayload('run-global-off', 'GLOBAL-OFF-BODY') })).json();
    await app.inject({ method: 'PATCH', url: `/skills/${globalOff.id}`, payload: { enabled: false } });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        links: [
          { skill_id: second.id, enabled: true },
          { skill_id: off.id, enabled: false },
          { skill_id: first.id, enabled: true },
          { skill_id: globalOff.id, enabled: true },
        ],
      },
    });

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-demo', fullName: 'acme/skills-demo' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add bulk discount',
        author: 'dev',
        branch: 'feat/discount',
        base: 'main',
        headSha: 'abc123',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(db, pr!.id, { expected: 1 });

    const call = llm.calls.find((c) => c.method === 'completeStructured');
    const req = call!.req as { messages: { role: string; content: string }[] };
    const system = req.messages[0]!.content;
    expect(system.indexOf('SECOND-BODY')).toBeGreaterThan(system.indexOf('AGENT-SYS'));
    expect(system.indexOf('FIRST-BODY')).toBeGreaterThan(system.indexOf('SECOND-BODY'));
    expect(system).not.toContain('OFF-BODY');
    expect(system).not.toContain('GLOBAL-OFF-BODY');
    expect(req.messages[1]!.content).not.toContain('FIRST-BODY');

    const runId = res.json().runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.skills).toContain('### Skill 1: run-second');
    expect(trace.prompt_assembly.skill_blocks.map((b: { name: string }) => b.name)).toEqual([
      'run-second',
      'run-first',
    ]);
    for (const b of trace.prompt_assembly.skill_blocks) expect(b.tokens).toBeGreaterThan(0);
    expect(trace.log.some((l: { msg: string }) => l.msg.startsWith('Skills attached: 2'))).toBe(true);
    await app.close();
  });

  it('GET /skills/:id/versions lists body snapshots newest first; unknown id → 404', async () => {
    const app = await appWith();
    const skill = (await app.inject({ method: 'POST', url: '/skills', payload: skillPayload('ver-skill', 'V1') })).json();
    await app.inject({ method: 'PATCH', url: `/skills/${skill.id}`, payload: { body: 'V2' } });
    await app.inject({ method: 'PATCH', url: `/skills/${skill.id}`, payload: { body: 'V3' } });

    const res = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` });
    expect(res.statusCode).toBe(200);
    const versions = res.json();
    expect(versions.map((v: { version: number; body: string }) => [v.version, v.body])).toEqual([
      [3, 'V3'],
      [2, 'V2'],
      [1, 'V1'],
    ]);
    for (const v of versions) expect(Number.isNaN(Date.parse(v.created_at))).toBe(false);

    const missing = await app.inject({
      method: 'GET',
      url: '/skills/00000000-0000-4000-8000-000000000000/versions',
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('GET /skills/:id/stats counts links and runs from traces; unknown id → 404', async () => {
    const app = await appWith();
    const db = pg.handle.db;
    const mkAgent = async (name: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'sys' },
        })
      ).json();
    const runner = await mkAgent('Stats Agent A');
    const idle = await mkAgent('Stats Agent B');
    const skill = (await app.inject({ method: 'POST', url: '/skills', payload: skillPayload('stats-skill') })).json();
    const unused = (await app.inject({ method: 'POST', url: '/skills', payload: skillPayload('stats-unused') })).json();
    await app.inject({
      method: 'POST',
      url: `/agents/${runner.id}/skills`,
      payload: { links: [{ skill_id: skill.id, enabled: true }] },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${idle.id}/skills`,
      payload: { links: [{ skill_id: skill.id, enabled: false }] },
    });

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-stats', fullName: 'acme/skills-stats' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 8,
        title: 'Stats PR',
        author: 'dev',
        branch: 'feat/stats',
        base: 'main',
        headSha: 'def456',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    const review = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: runner.id } });
    expect(review.statusCode).toBe(200);
    await waitForPrRuns(db, pr!.id, { expected: 1 });

    const res = await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats.used_by).toBe(1);
    expect(stats.agents).toEqual([
      { id: runner.id, name: 'Stats Agent A', link_enabled: true, agent_enabled: true },
      { id: idle.id, name: 'Stats Agent B', link_enabled: false, agent_enabled: true },
    ]);
    expect(stats.runs_30d).toBe(1);
    expect(stats.pull_rate).toBe(100);
    expect(Number.isNaN(Date.parse(stats.last_used_at))).toBe(false);

    // No links and no traces → nothing to rate against.
    const none = (await app.inject({ method: 'GET', url: `/skills/${unused.id}/stats` })).json();
    expect(none).toEqual({ used_by: 0, agents: [], runs_30d: 0, pull_rate: null, last_used_at: null });

    const missing = await app.inject({
      method: 'GET',
      url: '/skills/00000000-0000-4000-8000-000000000000/stats',
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('seeds the M2 agents without skills', async () => {
    const agents = (await (await appWith()).inject({ method: 'GET', url: '/agents' })).json();
    const names = agents.map((a: { name: string }) => a.name);
    expect(names).toEqual(expect.arrayContaining(['Test Quality Reviewer', 'API Contract Reviewer']));
    const tq = agents.find((a: { name: string }) => a.name === 'Test Quality Reviewer');
    expect(tq.skill_count).toBe(0);
  });
});
