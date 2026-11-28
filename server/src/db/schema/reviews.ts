import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  boolean,
  check,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id'),
  /** The agent_run that produced this review (links the timeline run ↔ review). */
  runId: uuid('run_id'),
  kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
  verdict: text('verdict'),
  summary: text('summary'),
  score: integer('score'),
  model: text('model'),
  createdAt: now(),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  file: text('file').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  suggestion: text('suggestion'),
  confidence: doublePrecision('confidence').notNull(),
  kind: text('kind').notNull().default('finding'),
  trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
});

export const prIntent = pgTable(
  'pr_intent',
  {
    prId: uuid('pr_id')
      .primaryKey()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    /** One-sentence summary (what + why). */
    intent: text('intent').notNull(),
    inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // ---- M3 intent layer ----
    category: text('category').notNull().default('unknown'),
    breaking: boolean('breaking').notNull().default(false),
    /** min(model confidence, evidence cap) — calibrated in code. */
    confidence: doublePrecision('confidence').notNull().default(0),
    confidenceLevel: text('confidence_level').notNull().default('low'),
    documented: boolean('documented').notNull().default(false),
    signals: jsonb('signals').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    sources: jsonb('sources').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    unresolvedRefs: jsonb('unresolved_refs').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    riskAreas: jsonb('risk_areas').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    /** sha256 of the canonical classifier input (+ provider, model, prompt version). */
    inputHash: text('input_hash'),
    headSha: text('head_sha'),
    provider: text('provider'),
    model: text('model'),
    costUsd: doublePrecision('cost_usd'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // text + CHECK (not a pg enum): the value set may grow without ALTER TYPE.
    confidenceLevelCheck: check(
      'pr_intent_confidence_level_check',
      sql`${t.confidenceLevel} in ('high', 'medium', 'low')`,
    ),
  }),
);

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
