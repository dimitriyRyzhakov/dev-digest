import type {
  FeatureModelChoice,
  GitHubClient,
  LLMProvider,
  PrIntentRecord,
  Provider,
  RepoRef,
  RunEventKind,
} from '@devdigest/shared';

/**
 * Ports for the intent use cases (M3). The repository implements
 * `IntentStore`; everything else is wired in platform/container.ts, so the
 * service never touches db, fs, git or an SDK directly.
 */

export interface IntentPullRef {
  id: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
}

export interface IntentRepoRef {
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

/** A record to persist (the store stamps `updated_at`). */
export type NewPrIntent = Omit<PrIntentRecord, 'updated_at'>;

export interface IntentStore {
  /** The PR when it belongs to the workspace. */
  getPull(workspaceId: string, prId: string): Promise<IntentPullRef | undefined>;
  /** Commit messages of the PR, newest first. */
  getCommits(prId: string): Promise<string[]>;
  get(prId: string): Promise<PrIntentRecord | undefined>;
  upsert(record: NewPrIntent): Promise<PrIntentRecord>;
}

/** The run logger surface the intent step writes to (RunLogger satisfies it). */
export interface IntentLog {
  info(msg: string): void;
  tool(msg: string): void;
  result(msg: string): void;
  error(msg: string): void;
  step<T>(label: string, fn: () => Promise<T>, opts?: { kind?: RunEventKind }): Promise<T>;
}

export interface IntentDeps {
  store: IntentStore;
  /** GitHub client; throws when no token is configured (tickets → `no_github_token`). */
  github: () => Promise<GitHubClient>;
  /** Contained blob read at a sha (GitClient.showFile); null on any refusal. */
  showFile: (repo: RepoRef, sha: string, path: string, opts?: { maxBytes?: number }) => Promise<string | null>;
  /** Contained read of a working-tree file; null when it can't be read safely. */
  readFile: (cloneRoot: string, rel: string, opts?: { maxBytes?: number }) => Promise<string | null>;
  /** The workspace's `review_intent` feature model, else the registry default. */
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** Classifier call timeout. */
  timeoutMs: number;
}
