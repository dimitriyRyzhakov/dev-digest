import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { SmartDiffStore } from '../src/modules/smart-diff/ports.js';
import type { SmartDiffFileInput, SmartDiffReviewInput } from '../src/modules/smart-diff/domain.js';

const WS = 'ws-1';
const PR = 'pr-1';

/** In-memory SmartDiffStore: one PR in workspace `ws-1`. */
function fakeStore(files: SmartDiffFileInput[], reviews: SmartDiffReviewInput[] = []): SmartDiffStore {
  return {
    pullExists: async (ws, pr) => ws === WS && pr === PR,
    getFiles: async () => files,
    getReviews: async () => reviews,
  };
}

const FILES: SmartDiffFileInput[] = [
  { path: 'src/limiter.ts', additions: 10, deletions: 2 },
  { path: 'pnpm-lock.yaml', additions: 300, deletions: 100 },
  { path: 'src/limiter.test.ts', additions: 20, deletions: 0 },
  { path: 'README.md', additions: 3, deletions: 1 },
  { path: 'src/api.ts', additions: 5, deletions: 5 },
];

function review(over: Partial<SmartDiffReviewInput> & Pick<SmartDiffReviewInput, 'id'>): SmartDiffReviewInput {
  return { agentId: 'agent-a', kind: 'review', createdAt: '2026-11-28T10:00:00.000Z', findings: [], ...over };
}

const lines = (diff: SmartDiff, path: string) =>
  diff.groups.flatMap((g) => g.files).find((f) => f.path === path)?.finding_lines;

describe('SmartDiffService.get', () => {
  it('throws NotFoundError for an unknown PR or another workspace', async () => {
    const service = new SmartDiffService({ store: fakeStore(FILES) });
    await expect(service.get('other-ws', PR)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.get(WS, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('before any review: five groups in role order, empty finding_lines, lock file in boilerplate', async () => {
    const diff = await new SmartDiffService({ store: fakeStore(FILES) }).get(WS, PR);
    expect(() => SmartDiff.parse(diff)).not.toThrow();
    expect(diff.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(diff.groups.map((g) => g.files.map((f) => f.path))).toEqual([
      ['src/limiter.ts', 'src/api.ts'],
      ['src/limiter.test.ts'],
      [],
      ['README.md'],
      ['pnpm-lock.yaml'],
    ]);
    expect(diff.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
  });

  it('keeps all five groups for a PR without files', async () => {
    const diff = await new SmartDiffService({ store: fakeStore([]) }).get(WS, PR);
    expect(diff.groups).toEqual([
      { role: 'core', files: [] },
      { role: 'tests', files: [] },
      { role: 'wiring', files: [] },
      { role: 'docs', files: [] },
      { role: 'boilerplate', files: [] },
    ]);
    expect(diff.split_suggestion).toEqual({ too_big: false, total_lines: 0, proposed_splits: [] });
  });

  it('split_suggestion.total_lines = Σ(additions + deletions), no splits proposed', async () => {
    const diff = await new SmartDiffService({ store: fakeStore(FILES) }).get(WS, PR);
    expect(diff.split_suggestion).toEqual({ too_big: false, total_lines: 446, proposed_splits: [] });
  });

  it('two reviews of the same agent → only the newest one counts', async () => {
    const reviews = [
      review({
        id: 'old',
        createdAt: '2026-11-27T10:00:00.000Z',
        findings: [{ file: 'src/limiter.ts', startLine: 3, dismissed: false }],
      }),
      review({
        id: 'new',
        createdAt: '2026-11-28T10:00:00.000Z',
        findings: [
          { file: 'src/limiter.ts', startLine: 9, dismissed: false },
          { file: 'src/limiter.ts', startLine: 4, dismissed: false },
          { file: 'src/limiter.ts', startLine: 9, dismissed: false },
        ],
      }),
    ];
    const diff = await new SmartDiffService({ store: fakeStore(FILES, reviews) }).get(WS, PR);
    expect(lines(diff, 'src/limiter.ts')).toEqual([4, 9]);
  });

  it('different agents each contribute their newest review', async () => {
    const reviews = [
      review({ id: 'a', agentId: 'agent-a', findings: [{ file: 'src/api.ts', startLine: 7, dismissed: false }] }),
      review({ id: 'b', agentId: 'agent-b', findings: [{ file: 'src/api.ts', startLine: 2, dismissed: false }] }),
    ];
    const diff = await new SmartDiffService({ store: fakeStore(FILES, reviews) }).get(WS, PR);
    expect(lines(diff, 'src/api.ts')).toEqual([2, 7]);
  });

  it('reviews without an agent are keyed by review id (none hides another)', async () => {
    const reviews = [
      review({
        id: 'r1',
        agentId: null,
        createdAt: '2026-11-27T10:00:00.000Z',
        findings: [{ file: 'src/api.ts', startLine: 1, dismissed: false }],
      }),
      review({
        id: 'r2',
        agentId: null,
        createdAt: '2026-11-28T10:00:00.000Z',
        findings: [{ file: 'src/api.ts', startLine: 5, dismissed: false }],
      }),
    ];
    const diff = await new SmartDiffService({ store: fakeStore(FILES, reviews) }).get(WS, PR);
    expect(lines(diff, 'src/api.ts')).toEqual([1, 5]);
  });

  it('summary reviews are ignored, even when newer', async () => {
    const reviews = [
      review({ id: 'rev', findings: [{ file: 'src/api.ts', startLine: 3, dismissed: false }] }),
      review({
        id: 'sum',
        kind: 'summary',
        createdAt: '2026-11-29T10:00:00.000Z',
        findings: [{ file: 'src/api.ts', startLine: 8, dismissed: false }],
      }),
    ];
    const diff = await new SmartDiffService({ store: fakeStore(FILES, reviews) }).get(WS, PR);
    expect(lines(diff, 'src/api.ts')).toEqual([3]);
  });

  it('dismissed findings are excluded from finding_lines', async () => {
    const reviews = [
      review({
        id: 'r',
        findings: [
          { file: 'src/api.ts', startLine: 3, dismissed: true },
          { file: 'src/api.ts', startLine: 6, dismissed: false },
          { file: 'README.md', startLine: 1, dismissed: true },
        ],
      }),
    ];
    const diff = await new SmartDiffService({ store: fakeStore(FILES, reviews) }).get(WS, PR);
    expect(lines(diff, 'src/api.ts')).toEqual([6]);
    expect(lines(diff, 'README.md')).toEqual([]);
  });

  it('ignores findings on files that are not in the PR', async () => {
    const reviews = [review({ id: 'r', findings: [{ file: 'src/gone.ts', startLine: 2, dismissed: false }] })];
    const diff = await new SmartDiffService({ store: fakeStore(FILES, reviews) }).get(WS, PR);
    expect(diff.groups.flatMap((g) => g.files).map((f) => f.path)).not.toContain('src/gone.ts');
  });
});
