import type { IconName } from "@devdigest/ui";
import type { RunSummary, PrCommit } from "@devdigest/shared";

export type OutcomeKey = "running" | "error" | "cancelled" | "rejected" | "reviewed" | "approved";
export type Outcome = { key: OutcomeKey; color: string; bg: string; icon: IconName };

/**
 * What a run's badge says. It reflects the review OUTCOME, not just the run
 * lifecycle: a finished run that found blockers reads "rejected", never a green
 * "done". Outcome comes from the denormalized blocker/finding counts on the run
 * row, so it matches the CI gate (deterministic) rather than the model's verdict.
 */
export function outcomeKey(run: Pick<RunSummary, "status" | "blockers" | "findings_count">): OutcomeKey {
  const status = run.status ?? "";
  if (status === "running") return "running";
  if (status === "failed") return "error";
  if (status === "cancelled") return "cancelled";
  if ((run.blockers ?? 0) > 0) return "rejected";
  if ((run.findings_count ?? 0) > 0) return "reviewed";
  return "approved";
}

const OUTCOME_LOOK: Record<OutcomeKey, Omit<Outcome, "key">> = {
  running: { color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" },
  error: { color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" },
  cancelled: { color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" },
  rejected: { color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" },
  reviewed: { color: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare" },
  approved: { color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" },
};

/** Outcome key + its badge colours/icon. */
export function outcomeOf(run: Pick<RunSummary, "status" | "blockers" | "findings_count">): Outcome {
  const key = outcomeKey(run);
  return { key, ...OUTCOME_LOOK[key] };
}

export type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

/** Epoch ms for sorting; unparseable / missing timestamps sort last. */
export function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

/** Runs and commits interleaved on one timeline, newest first. */
export function buildTimeline(runs: RunSummary[], commits: PrCommit[]): TimelineItem[] {
  return [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({ kind: "commit" as const, ts: tsOf(commit.committed_at), commit })),
  ].sort((a, b) => b.ts - a.ts);
}
