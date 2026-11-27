import type {
  ConventionCandidate,
  ConventionStatus,
  FeatureModelChoice,
  LLMProvider,
  Provider,
  Skill,
} from '@devdigest/shared';

/**
 * Ports for the conventions use cases (M2). The repository implements
 * `ConventionStore`; everything else is wired from the container
 * (platform/container.ts), so the service never touches db, fs or adapters.
 */

export interface ConventionRepoRef {
  id: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

/** A grounded candidate ready to insert. */
export interface NewConvention {
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  evidenceStartLine: number;
  evidenceEndLine: number;
  confidence: number;
  category: string | null;
  /** Files sent to the model in this scan (configs + samples). */
  sampleFiles: number;
}

export interface ConventionChanges {
  rule?: string;
  status?: ConventionStatus;
}

export interface ConventionStore {
  getRepo(workspaceId: string, repoId: string): Promise<ConventionRepoRef | undefined>;
  /** The repo's candidates, newest first. */
  list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]>;
  /** `sample_files` of the repo's newest candidate (the latest scan); null when none. */
  lastScanSampleFiles(workspaceId: string, repoId: string): Promise<number | null>;
  update(
    workspaceId: string,
    id: string,
    changes: ConventionChanges,
  ): Promise<ConventionCandidate | undefined>;
  /**
   * One transaction: delete the repo's pending + rejected candidates, insert
   * `rows`. Accepted candidates are kept.
   */
  replaceAfterScan(workspaceId: string, repoId: string, rows: NewConvention[]): Promise<void>;
}

/** Writes the merged skill (implemented by SkillsService.upsertExtracted). */
export interface ExtractedSkillWriter {
  upsertExtracted(
    workspaceId: string,
    input: { name: string; description: string; body: string; enabled: boolean; evidenceFiles: string[] },
  ): Promise<{ skill: Skill; created: boolean }>;
}

export interface ConventionsDeps {
  store: ConventionStore;
  skills: ExtractedSkillWriter;
  /** Top-ranked source paths (repoIntel.getConventionSamples). No model call. */
  samples: (repoId: string, n: number) => Promise<string[]>;
  /** Contained read of a repo-relative file; null when it can't be read safely. */
  readFile: (cloneRoot: string, rel: string, opts?: { maxBytes?: number }) => Promise<string | null>;
  /** The workspace's `conventions` feature model (Settings), else the registry default. */
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  llm: (provider: Provider) => Promise<LLMProvider>;
}
