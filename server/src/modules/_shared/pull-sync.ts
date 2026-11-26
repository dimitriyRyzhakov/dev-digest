import type { PrMeta } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Upsert the PR list fetched from GitHub into `pull_requests`. Shared by the
 * PR list route and the manual poll so both keep the same columns in sync.
 *
 * On conflict every field GitHub can change after a PR is opened is refreshed:
 * a retargeted base branch, a renamed head branch, new commits (head sha, line
 * counts, file count), title, status. Without `base` the review diff would
 * keep running against the old base. `author` and `opened_at` never change.
 */
export async function upsertPullRequests(
  db: Db,
  workspaceId: string,
  repoId: string,
  pulls: PrMeta[],
): Promise<number> {
  for (const pr of pulls) {
    const updatedAt = pr.updated_at ? new Date(pr.updated_at) : null;
    await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        headSha: pr.head_sha,
        additions: pr.additions,
        deletions: pr.deletions,
        filesCount: pr.files_count,
        status: pr.status,
        openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: pr.title,
          branch: pr.branch,
          base: pr.base,
          headSha: pr.head_sha,
          additions: pr.additions,
          deletions: pr.deletions,
          filesCount: pr.files_count,
          status: pr.status,
          updatedAt,
        },
      });
  }
  return pulls.length;
}
