import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import {
  IntentCategory,
  IntentConfidenceLevel,
  IntentRiskArea,
  IntentSignal,
  IntentSource,
  IntentUnresolvedRef,
  type PrIntentRecord,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { IntentPullRef, IntentStore, NewPrIntent } from './ports.js';

type PrIntentRow = typeof t.prIntent.$inferSelect;

// jsonb is a trust boundary: a malformed entry degrades to [] instead of
// failing the read (or the review that uses it).
const Signals = IntentSignal.array().catch([]);
const Sources = IntentSource.array().catch([]);
const Unresolved = IntentUnresolvedRef.array().catch([]);
const RiskAreas = IntentRiskArea.array().max(6).catch([]);
const Strings = z.array(z.string()).catch([]);

export function rowToPrIntent(row: PrIntentRow): PrIntentRecord {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: Strings.parse(row.inScope),
    out_of_scope: Strings.parse(row.outOfScope),
    category: IntentCategory.catch('unknown').parse(row.category),
    breaking: row.breaking,
    confidence: Math.min(1, Math.max(0, row.confidence)),
    confidence_level: IntentConfidenceLevel.catch('low').parse(row.confidenceLevel),
    documented: row.documented,
    signals: Signals.parse(row.signals),
    sources: Sources.parse(row.sources),
    unresolved_refs: Unresolved.parse(row.unresolvedRefs),
    risk_areas: RiskAreas.parse(row.riskAreas),
    provider: row.provider,
    model: row.model,
    cost_usd: row.costUsd,
    input_hash: row.inputHash,
    head_sha: row.headSha,
    updated_at: new Date(row.updatedAt).toISOString(),
  };
}

/** Drizzle implementation of `IntentStore` — the single owner of `pr_intent`. */
export class IntentRepository implements IntentStore {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<IntentPullRef | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        branch: t.pullRequests.branch,
        headSha: t.pullRequests.headSha,
      })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getCommits(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId))
      .orderBy(desc(t.prCommits.committedAt));
    return rows.map((r) => r.message);
  }

  async get(prId: string): Promise<PrIntentRecord | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row ? rowToPrIntent(row) : undefined;
  }

  async upsert(record: NewPrIntent): Promise<PrIntentRecord> {
    const values = {
      intent: record.intent,
      inScope: record.in_scope,
      outOfScope: record.out_of_scope,
      category: record.category,
      breaking: record.breaking,
      confidence: record.confidence,
      confidenceLevel: record.confidence_level,
      documented: record.documented,
      signals: record.signals,
      sources: record.sources,
      unresolvedRefs: record.unresolved_refs,
      riskAreas: record.risk_areas,
      inputHash: record.input_hash ?? null,
      headSha: record.head_sha ?? null,
      provider: record.provider ?? null,
      model: record.model ?? null,
      costUsd: record.cost_usd ?? null,
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .insert(t.prIntent)
      .values({ prId: record.pr_id, ...values })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: values })
      .returning();
    return rowToPrIntent(row!);
  }
}
