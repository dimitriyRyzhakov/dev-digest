import type {
  IntentTraceSnapshot,
  PrIntentRecord,
  RunEventKind,
  UnifiedDiff,
} from '@devdigest/shared';
import type { PromptIntent } from '@devdigest/reviewer-core';

/**
 * Ports the review run consumes from other modules, declared here (where they
 * are used) and wired in platform/container.ts — the executor never imports
 * another module's internals.
 */

/** The PR intent a run uses (M3): the persisted record + cache flag. */
export type ResolvedPrIntent = PrIntentRecord & { cached: boolean };

/** Logger surface the intent pre-step writes to (the fanned-out RunLogger). */
export interface IntentStepLog {
  info(msg: string): void;
  tool(msg: string): void;
  result(msg: string): void;
  error(msg: string): void;
  step<T>(label: string, fn: () => Promise<T>, opts?: { kind?: RunEventKind }): Promise<T>;
}

/** The PR fields the intent pre-step needs (no DB row types cross the port). */
export interface IntentPullInput {
  id: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
}

/** The repo fields the intent pre-step needs. */
export interface IntentRepoInput {
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

/** Shared review pre-step: classify the PR's intent once per run request (IntentService). */
export interface PrIntentResolver {
  resolveForReview(input: {
    workspaceId: string;
    pull: IntentPullInput;
    repo: IntentRepoInput;
    diff: UnifiedDiff;
    log: IntentStepLog;
  }): Promise<ResolvedPrIntent>;
  /** The engine's resolved intent block input. */
  toPromptIntent(intent: ResolvedPrIntent): PromptIntent;
  /** The run trace's `intent` snapshot. */
  toTraceSnapshot(intent: ResolvedPrIntent): IntentTraceSnapshot;
}
