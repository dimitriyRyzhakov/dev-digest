import type { SmartDiffFileInput, SmartDiffReviewInput } from './domain.js';

/**
 * Ports for the Smart Diff use case (M3). The repository implements `SmartDiffStore`; the
 * container wires it, so the service never touches the db directly.
 */
export interface SmartDiffStore {
  /** True when the PR exists and belongs to the workspace. */
  pullExists(workspaceId: string, prId: string): Promise<boolean>;
  /** Changed files of the PR. Not workspace-scoped: call only after `pullExists` returned true. */
  getFiles(prId: string): Promise<SmartDiffFileInput[]>;
  /** Stored reviews of the PR with their findings. Not workspace-scoped: call only after `pullExists`. */
  getReviews(prId: string): Promise<SmartDiffReviewInput[]>;
}

export interface SmartDiffDeps {
  store: SmartDiffStore;
}
