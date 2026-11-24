/**
 * Shared contract types re-exported from @devdigest/shared (single source of
 * truth). F2 imports these rather than redefining them.
 *
 * F1 (@devdigest/shared) currently exports all the platform/findings/brief/
 * knowledge/trace contracts we need for the scaffolding screens, so there are
 * NO local placeholders required at this time. If a feature agent's contract is
 * not yet exported, add a placeholder below marked
 * `// TODO: reconcile with @devdigest/shared`.
 */
import type { Agent } from "@devdigest/shared";

export type {
  Settings,
  SettingsUpdate,
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  FeatureModelId,
  FeatureModelChoice,
  FeatureModelDef,
  Provider,
  ModelInfo,
  Repo,
  RepoInput,
  PrMeta,
  PrDetail,
  PrFile,
  PrCommit,
  PrReviewComment,
  PrStatus,
  SpecFile,
  IndexStatus,
} from "@devdigest/shared";

export type { Review, Finding, Severity, Verdict } from "@devdigest/shared";
export type { PrBrief, SmartDiff } from "@devdigest/shared";
export type {
  Skill,
  SkillType,
  SkillSource,
  SkillInput,
  SkillPatch,
  SkillImportPreview,
  AgentSkillLink,
  SkillBlock,
  SkillVersion,
  SkillStats,
} from "@devdigest/shared";

/** One entry of an agent's ordered skill set — POST /agents/:id/skills `links` (order = index). */
export interface AgentSkillLinkInput {
  skill_id: string;
  enabled: boolean;
}

/** Editable agent fields — PATCH /agents/:id body (useUpdateAgent, Config tab form). */
export type AgentPatch = Partial<
  Pick<
    Agent,
    | "name"
    | "description"
    | "provider"
    | "model"
    | "system_prompt"
    | "output_schema"
    | "strategy"
    | "ci_fail_on"
    | "repo_intel"
    | "enabled"
  >
>;

/** UI-only view model for a PR list row (derives display fields from PrMeta). */
export interface PrRowView {
  number: number;
  title: string;
  author: string;
  size: "S" | "M" | "L";
  sizeLines: string;
  score: number;
  findings: { CRITICAL: number; WARNING: number; SUGGESTION: number };
  status: "needs_review" | "reviewed" | "stale";
  updated: string;
}
