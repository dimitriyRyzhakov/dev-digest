import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

// ---- Intent layer (M3): classification, evidence, unresolved refs ----
/** Conventional Commits meaning, plus security / deps / revert / unknown. */
export const IntentCategory = z.enum([
  'feat',
  'fix',
  'refactor',
  'perf',
  'docs',
  'test',
  'build',
  'ci',
  'chore',
  'style',
  'security',
  'deps',
  'revert',
  'unknown',
]);
export type IntentCategory = z.infer<typeof IntentCategory>;

/** Evidence level computed in code (never taken from the model). */
export const IntentConfidenceLevel = z.enum(['high', 'medium', 'low']);
export type IntentConfidenceLevel = z.infer<typeof IntentConfidenceLevel>;

export const IntentSourceKind = z.enum([
  'title',
  'description',
  'ticket',
  'spec',
  'branch',
  'commits',
  'paths',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

/** One input actually sent to the classifier. */
export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  /** How it was obtained: GitHub API, blob at head sha, working tree, PR diff, PR row. */
  via: z.enum(['github', 'head', 'worktree', 'diff', 'pr']).nullish(),
  chars: z.number().int(),
  truncated: z.boolean(),
});
export type IntentSource = z.infer<typeof IntentSource>;

/** A ticket / spec / link found in PR text that was NOT read, and why. */
export const IntentUnresolvedRef = z.object({
  kind: z.enum(['ticket', 'spec', 'link']),
  ref: z.string(),
  host: z.string().nullish(),
  reason: z.enum([
    'external_host',
    'other_repo',
    'not_found',
    'no_github_token',
    'ext_not_allowed',
    'unsafe_path',
    'limit',
  ]),
});
export type IntentUnresolvedRef = z.infer<typeof IntentUnresolvedRef>;

/** A model-cited signal, kept only when it names a source that was sent. */
export const IntentSignal = z.object({
  source: IntentSourceKind,
  ref: z.string().nullish(),
  note: z.string(),
});
export type IntentSignal = z.infer<typeof IntentSignal>;

/** What kind of risk a change area carries (hint for reviewers, never a finding). */
export const IntentRiskKind = z.enum([
  'auth',
  'security',
  'dependency',
  'data',
  'migration',
  'performance',
  'api',
  'config',
  'other',
]);
export type IntentRiskKind = z.infer<typeof IntentRiskKind>;

/** A risk area: derived by code from the diff (`code`) or by the classifier (`model`). */
export const IntentRiskArea = z.object({
  kind: IntentRiskKind,
  label: z.string().max(80),
  origin: z.enum(['code', 'model']),
});
export type IntentRiskArea = z.infer<typeof IntentRiskArea>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;
