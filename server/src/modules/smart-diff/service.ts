import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { buildSmartDiff, selectDiffFindings } from './domain.js';
import type { SmartDiffDeps } from './ports.js';

/** Smart Diff use case (M3): deterministic, model-free grouping of a PR's files by role. */
export class SmartDiffService {
  constructor(private deps: SmartDiffDeps) {}

  async get(workspaceId: string, prId: string): Promise<SmartDiff> {
    const { store } = this.deps;
    if (!(await store.pullExists(workspaceId, prId))) throw new NotFoundError('Pull request not found');
    const [files, reviews] = await Promise.all([store.getFiles(prId), store.getReviews(prId)]);
    return buildSmartDiff(files, selectDiffFindings(reviews));
  }
}
