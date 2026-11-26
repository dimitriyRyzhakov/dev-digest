import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ConventionCandidate, ConventionStatus } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  ConventionChanges,
  ConventionRepoRef,
  ConventionStore,
  NewConvention,
} from './ports.js';

type ConventionRow = typeof t.conventions.$inferSelect;

function toCandidate(row: ConventionRow): ConventionCandidate {
  const status = row.status as ConventionStatus;
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_start_line: row.evidenceStartLine,
    evidence_end_line: row.evidenceEndLine,
    confidence: row.confidence ?? 0,
    category: row.category,
    accepted: status === 'accepted',
    status,
    created_at: new Date(row.createdAt).toISOString(),
  };
}

/** Drizzle implementation of `ConventionStore`. Workspace-scoped throughout. */
export class ConventionsRepository implements ConventionStore {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<ConventionRepoRef | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.createdAt), desc(t.conventions.confidence));
    return rows.map(toCandidate);
  }

  async lastScanSampleFiles(workspaceId: string, repoId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ sampleFiles: t.conventions.sampleFiles })
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.createdAt))
      .limit(1);
    return row?.sampleFiles ?? null;
  }

  async update(
    workspaceId: string,
    id: string,
    changes: ConventionChanges,
  ): Promise<ConventionCandidate | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set(changes)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row ? toCandidate(row) : undefined;
  }

  async replaceAfterScan(workspaceId: string, repoId: string, rows: NewConvention[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            inArray(t.conventions.status, ['pending', 'rejected']),
          ),
        );
      if (rows.length > 0) {
        await tx
          .insert(t.conventions)
          .values(rows.map((r) => ({ workspaceId, repoId, ...r, status: 'pending' as const })));
      }
    });
  }
}
