import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Skill, SkillStats, SkillVersion } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { toSkillDto as toSkill } from '../_shared/skill-dto.js';
import { ConflictError } from '../../platform/errors.js';
import type { NewSkill, SkillChanges, SkillStore } from './ports.js';

const UNIQUE_VIOLATION = '23505';
const STATS_WINDOW = sql`now() - interval '30 days'`;

/** Timestamps may come back as Date or string depending on the driver path. */
function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

/** postgres.js puts the SQLSTATE on the error; drizzle may wrap it in `cause`. */
function isUniqueViolation(err: unknown): boolean {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  return code(err) === UNIQUE_VIOLATION || code((err as { cause?: unknown })?.cause) === UNIQUE_VIOLATION;
}

async function withNameConflict<T>(name: string | undefined, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(`A skill named "${name ?? ''}" already exists`);
    }
    throw err;
  }
}

/** Drizzle implementation of `SkillStore`. Workspace-scoped throughout. */
export class SkillsRepository implements SkillStore {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
    return rows.map(toSkill);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row ? toSkill(row) : undefined;
  }

  async getByName(workspaceId: string, name: string): Promise<Skill | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row ? toSkill(row) : undefined;
  }

  async create(workspaceId: string, skill: NewSkill): Promise<Skill> {
    return withNameConflict(skill.name, () =>
      this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(t.skills)
          .values({ workspaceId, ...skill, enabled: skill.enabled ?? true, version: 1 })
          .returning();
        await tx.insert(t.skillVersions).values({ skillId: row!.id, version: 1, body: skill.body });
        return toSkill(row!);
      }),
    );
  }

  async update(
    workspaceId: string,
    id: string,
    changes: SkillChanges,
    newVersion?: number,
  ): Promise<Skill | undefined> {
    return withNameConflict(changes.name, () =>
      this.db.transaction(async (tx) => {
        const [row] = await tx
          .update(t.skills)
          .set({ ...changes, ...(newVersion !== undefined ? { version: newVersion } : {}) })
          .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
          .returning();
        if (!row) return undefined;
        if (newVersion !== undefined) {
          await tx
            .insert(t.skillVersions)
            .values({ skillId: row.id, version: newVersion, body: row.body })
            .onConflictDoNothing();
        }
        return toSkill(row);
      }),
    );
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    if (!(await this.exists(workspaceId, id))) return undefined;
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, id))
      .orderBy(desc(t.skillVersions.version));
    return rows.map((r) => ({ version: r.version, body: r.body, created_at: toIso(r.createdAt) }));
  }

  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    if (!(await this.exists(workspaceId, id))) return undefined;

    const agents = await this.db
      .select({
        id: t.agents.id,
        name: t.agents.name,
        link_enabled: t.agentSkills.enabled,
        agent_enabled: t.agents.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agentSkills.skillId, id), eq(t.agents.workspaceId, workspaceId)))
      .orderBy(asc(t.agents.name));

    // Parameterised jsonb containment: the id is bound, never concatenated.
    const included = sql`${t.runTraces.trace} -> 'prompt_assembly' -> 'skill_blocks' @> ${JSON.stringify([
      { skill_id: id },
    ])}::jsonb`;
    const recent = sql`${t.agentRuns.ranAt} > ${STATS_WINDOW}`;

    const [usage] = await this.db
      .select({
        runs30d: sql<number>`count(*) filter (where ${recent})::int`,
        lastUsedAt: sql<Date | string | null>`max(${t.agentRuns.ranAt})`,
      })
      .from(t.agentRuns)
      .innerJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), included));

    const linkedAgents = this.db
      .select({ agentId: t.agentSkills.agentId })
      .from(t.agentSkills)
      .where(eq(t.agentSkills.skillId, id));
    const [pull] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        withSkill: sql<number>`count(*) filter (where ${included})::int`,
      })
      .from(t.agentRuns)
      .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          recent,
          inArray(t.agentRuns.agentId, linkedAgents),
        ),
      );

    const total = Number(pull?.total ?? 0);
    const withSkill = Number(pull?.withSkill ?? 0);
    return {
      used_by: agents.filter((a) => a.link_enabled).length,
      agents,
      runs_30d: Number(usage?.runs30d ?? 0),
      pull_rate: total > 0 ? Math.round((withSkill / total) * 100) : null,
      last_used_at: usage?.lastUsedAt ? toIso(usage.lastUsedAt) : null,
    };
  }

  private async exists(workspaceId: string, id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row !== undefined;
  }
}
