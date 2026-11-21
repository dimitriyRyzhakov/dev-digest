/**
 * PR-list rollup helpers (`modules/pulls/status.ts`) — the pure derivation that
 * decides each PR's review STATUS and tallies its FINDINGS for the list. The DB
 * `status` column holds GitHub's merge state; the review status
 * (needs_review / reviewed / stale) is derived here from head vs lastReviewedSha
 * + age, so it gets unit coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveReviewStatus,
  latestReviewPerAgent,
  PREVIEW_LIMIT,
  rollupSeverities,
  STALE_DAYS,
  summarizeFindings,
  sumRunCosts,
} from '../src/modules/pulls/status.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 11);

describe('deriveReviewStatus', () => {
  it('needs_review when never reviewed, or when head moved since the last review', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: null, headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'old', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
  });

  it('reviewed when the current head was reviewed and the PR is recent', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now - DAY), now }),
    ).toBe('reviewed');
  });

  it('stale when the current head was reviewed but the PR is older than STALE_DAYS', () => {
    expect(
      deriveReviewStatus({
        ghStatus: 'open',
        lastReviewedSha: 'abc',
        headSha: 'abc',
        updatedAt: new Date(now - (STALE_DAYS + 1) * DAY),
        now,
      }),
    ).toBe('stale');
  });

  it('keeps merged/closed regardless of review state', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'merged', lastReviewedSha: null, headSha: 'abc', updatedAt: null, now }),
    ).toBe('merged');
    expect(
      deriveReviewStatus({ ghStatus: 'closed', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('closed');
  });
});

describe('rollupSeverities', () => {
  it('tallies findings into critical / warning / suggestion buckets (ignores unknown)', () => {
    expect(
      rollupSeverities([
        { severity: 'CRITICAL' },
        { severity: 'CRITICAL' },
        { severity: 'WARNING' },
        { severity: 'SUGGESTION' },
        { severity: 'WEIRD' },
      ]),
    ).toEqual({ critical: 2, warning: 1, suggestion: 1 });
  });

  it('is all-zero for no findings', () => {
    expect(rollupSeverities([])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });
});

describe('latestReviewPerAgent', () => {
  it('keeps the first (newest) review per agent per PR; null agent = its own group', () => {
    const kept = latestReviewPerAgent([
      { id: 'r5', prId: 'p1', agentId: 'sec' },
      { id: 'r4', prId: 'p1', agentId: 'perf' },
      { id: 'r3', prId: 'p1', agentId: 'sec' }, // older Security run → ignored
      { id: 'r2', prId: 'p1', agentId: null },
      { id: 'r1', prId: 'p1', agentId: null }, // separate null group → kept
      { id: 'q1', prId: 'p2', agentId: 'sec' }, // same agent, other PR → kept
    ]);
    expect(kept.get('p1')).toEqual(['r5', 'r4', 'r2', 'r1']);
    expect(kept.get('p2')).toEqual(['q1']);
  });
});

describe('summarizeFindings', () => {
  const f = (id: string, severity: string, confidence: number, rationale = 'why') => ({
    id,
    severity,
    category: 'bug',
    title: id,
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    confidence,
    rationale,
  });

  it('counts per contract level and skips unknown severities', () => {
    const { counts, preview } = summarizeFindings([f('a', 'WARNING', 0.9), f('b', 'INFO', 0.9)]);
    expect(counts).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });
    expect(preview.map((p) => p.id)).toEqual(['a']);
  });

  it('sorts by severity, then confidence desc, then id; caps at PREVIEW_LIMIT', () => {
    const rows = [
      f('s1', 'SUGGESTION', 0.99),
      f('w-low', 'WARNING', 0.5),
      f('w-high', 'WARNING', 0.9),
      f('c2', 'CRITICAL', 0.8),
      f('c1', 'CRITICAL', 0.8),
      f('s2', 'SUGGESTION', 0.1),
    ];
    const { counts, preview } = summarizeFindings(rows);
    expect(counts).toEqual({ CRITICAL: 2, WARNING: 2, SUGGESTION: 2 });
    expect(preview).toHaveLength(PREVIEW_LIMIT);
    expect(preview.map((p) => p.id)).toEqual(['c1', 'c2', 'w-high', 'w-low', 's1']);
  });

  it('truncates long rationales to 200 chars + ellipsis', () => {
    const { preview } = summarizeFindings([f('a', 'CRITICAL', 1, 'x'.repeat(500))]);
    expect(preview[0]!.rationale).toHaveLength(201);
    expect(preview[0]!.rationale.endsWith('…')).toBe(true);
  });

  it('empty input → zero counts, empty preview', () => {
    expect(summarizeFindings([])).toEqual({ counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, preview: [] });
  });
});

describe('sumRunCosts', () => {
  it('sums per PR, skipping null costs and null PRs', () => {
    const total = sumRunCosts([
      { prId: 'p1', costUsd: 0.001 },
      { prId: 'p1', costUsd: 0.002 },
      { prId: 'p1', costUsd: null },
      { prId: 'p2', costUsd: null },
      { prId: null, costUsd: 1 },
    ]);
    expect(total.get('p1')).toBeCloseTo(0.003, 10);
    expect(total.has('p2')).toBe(false);
    expect(total.size).toBe(1);
  });
});
