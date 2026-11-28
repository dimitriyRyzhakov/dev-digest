import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SmartDiffFileInput, SmartDiffReviewInput } from './domain.js';
import type { SmartDiffStore } from './ports.js';

/** Drizzle implementation of `SmartDiffStore` (read-only). */
export class SmartDiffRepository implements SmartDiffStore {
  constructor(private db: Db) {}

  async pullExists(workspaceId: string, prId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row !== undefined;
  }

  async getFiles(prId: string): Promise<SmartDiffFileInput[]> {
    return this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));
  }

  async getReviews(prId: string): Promise<SmartDiffReviewInput[]> {
    const reviews = await this.db
      .select({
        id: t.reviews.id,
        agentId: t.reviews.agentId,
        kind: t.reviews.kind,
        createdAt: t.reviews.createdAt,
      })
      .from(t.reviews)
      .where(eq(t.reviews.prId, prId));
    if (reviews.length === 0) return [];

    const findings = await this.db
      .select({
        reviewId: t.findings.reviewId,
        file: t.findings.file,
        startLine: t.findings.startLine,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .where(
        inArray(
          t.findings.reviewId,
          reviews.map((r) => r.id),
        ),
      );

    return reviews.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      kind: r.kind,
      createdAt: new Date(r.createdAt).toISOString(),
      findings: findings
        .filter((f) => f.reviewId === r.id)
        .map((f) => ({ file: f.file, startLine: f.startLine, dismissed: f.dismissedAt !== null })),
    }));
  }
}
