import { describe, it, expect } from 'vitest';
import { SmartDiffRole } from '@devdigest/shared';
import {
  buildSmartDiff,
  classifyFile,
  selectDiffFindings,
  type SmartDiffReviewInput,
} from '../src/modules/smart-diff/domain.js';
import { SMART_DIFF_ROLE_ORDER, SMART_DIFF_RULES } from '../src/modules/smart-diff/constants.js';

describe('classifyFile', () => {
  const table: Array<[path: string, role: SmartDiffRole]> = [
    // boilerplate — wins over every other rule (a snapshot inside __tests__ is generated output)
    ['__tests__/__snapshots__/x.snap', 'boilerplate'],
    ['pnpm-lock.yaml', 'boilerplate'],
    ['server/package-lock.json', 'boilerplate'],
    ['client/yarn.lock', 'boilerplate'],
    ['Cargo.lock', 'boilerplate'],
    ['dist/a.js', 'boilerplate'],
    ['packages/web/build/main.js', 'boilerplate'],
    ['src/api.generated.ts', 'boilerplate'],
    ['public/vendor.min.js', 'boilerplate'],
    ['src/components/__snapshots__/Button.test.tsx.snap', 'boilerplate'],

    // tests
    ['server/test/x.it.test.ts', 'tests'],
    ['client/src/a.test.tsx', 'tests'],
    ['src/a.test.ts', 'tests'],
    ['src/a.spec.ts', 'tests'],
    ['tests/helpers/pg.ts', 'tests'],
    ['src/__tests__/util.ts', 'tests'],
    // Decision (user, 2026-11-28): test-dir precedence beats docs, so a README inside e2e/ is a test file.
    ['e2e/README.md', 'tests'],

    // wiring
    ['.claude/skills/security/SKILL.md', 'wiring'],
    ['client/src/components/diff-viewer/index.ts', 'wiring'],
    ['src/index.js', 'wiring'],
    ['vitest.config.ts', 'wiring'],
    ['client/next.config.mjs', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'],
    ['.env.example', 'wiring'],
    ['server/.env', 'wiring'],
    ['tsconfig.json', 'wiring'],
    ['client/tsconfig.build.json', 'wiring'],
    ['.eslintrc.cjs', 'wiring'],
    ['docker-compose.yml', 'wiring'],
    ['docker-compose.test.yml', 'wiring'],

    // docs
    ['docs/a.md', 'docs'],
    ['server/docs/intent-layer.txt', 'docs'],
    ['CHANGELOG.md', 'docs'],
    ['README', 'docs'],
    ['server/README.md', 'docs'],
    ['LICENSE', 'docs'],
    ['INSIGHTS.md', 'docs'],

    // core (fallback)
    ['src/middleware/ratelimit.ts', 'core'],
    ['server/src/modules/smart-diff/domain.ts', 'core'],
    ['client/src/app/page.tsx', 'core'],
    ['package.json', 'core'],
  ];

  it.each(table)('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it('strips a leading ./ before matching', () => {
    expect(classifyFile('./pnpm-lock.yaml')).toBe('boilerplate');
    expect(classifyFile('./src/index.ts')).toBe('wiring');
    expect(classifyFile('./src/a.ts')).toBe('core');
  });

  it('matches directories at any depth but only as whole segments', () => {
    expect(classifyFile('a/b/c/dist/x.js')).toBe('boilerplate');
    expect(classifyFile('src/distance.ts')).toBe('core');
    expect(classifyFile('src/latest/x.ts')).toBe('core');
    expect(classifyFile('src/mydocs/x.ts')).toBe('core');
    expect(classifyFile('src/contest/x.ts')).toBe('core');
  });

  it('matches case-sensitively', () => {
    expect(classifyFile('Docs/x.ts')).toBe('core');
    expect(classifyFile('Test/x.ts')).toBe('core');
    expect(classifyFile('src/Index.ts')).toBe('core');
  });

  it('does not treat a basename pattern as a substring of a directory name', () => {
    expect(classifyFile('src/index.ts.bak/a.ts')).toBe('core');
    expect(classifyFile('src/app.config/handler.ts')).toBe('core');
    expect(classifyFile('README/src/a.ts')).toBe('core');
  });

  // Paths are author-controlled; every rule must stay linear on long input (ReDoS guard).
  it('classifies 10 000-char adversarial paths in under 50 ms each', () => {
    const shapes = [
      'a'.repeat(10_000),
      'a/'.repeat(5_000),
      '/'.repeat(10_000),
      '.'.repeat(10_000),
      `${'.generated'.repeat(1_000)}/x`,
      `${'.config'.repeat(1_430)}/x`,
      `${'tsconfig'.repeat(1_250)}/x`,
      `${'docker-compose'.repeat(715)}/x`,
      `${'.test'.repeat(2_000)}/x`,
      `${'./'.repeat(5_000)}x`,
    ];
    for (const path of shapes) {
      expect(path.length).toBeGreaterThanOrEqual(10_000);
      const t0 = performance.now();
      classifyFile(path);
      expect(performance.now() - t0, `shape ${path.slice(0, 24)}…`).toBeLessThan(50);
    }
  });
});

describe('smart-diff constants', () => {
  it('SMART_DIFF_ROLE_ORDER equals the contract enum order', () => {
    expect([...SMART_DIFF_ROLE_ORDER]).toEqual(SmartDiffRole.options);
  });

  it('rules run in precedence boilerplate → tests → wiring → docs, with core as the fallback', () => {
    expect(SMART_DIFF_RULES.map((r) => r.role)).toEqual(['boilerplate', 'tests', 'wiring', 'docs']);
    for (const rule of SMART_DIFF_RULES) {
      expect(rule.patterns.length).toBeGreaterThan(0);
      expect(rule.globs.length).toBeGreaterThan(0);
    }
  });
});

describe('classifyFile — long paths', () => {
  it('clips from the start, so a path over the cap keeps its basename role', () => {
    expect(classifyFile(`${'a/'.repeat(3000)}pnpm-lock.yaml`)).toBe('boilerplate');
    expect(classifyFile(`${'a/'.repeat(3000)}src/feature.ts`)).toBe('core');
  });
});

const review = (over: Partial<SmartDiffReviewInput> & { id: string }): SmartDiffReviewInput => ({
  agentId: 'agent-a',
  kind: 'review',
  createdAt: '2026-11-28T10:00:00.000Z',
  findings: [],
  ...over,
});
const finding = (file: string, startLine: number, dismissed = false) => ({ file, startLine, dismissed });

describe('selectDiffFindings', () => {
  it('keeps only the newest review per agent and skips summary reviews', () => {
    const selected = selectDiffFindings([
      review({ id: 'old', createdAt: '2026-11-28T09:00:00.000Z', findings: [finding('a.ts', 1)] }),
      review({ id: 'new', createdAt: '2026-11-28T11:00:00.000Z', findings: [finding('a.ts', 2)] }),
      review({ id: 'mid', createdAt: '2026-11-28T10:00:00.000Z', findings: [finding('a.ts', 3)] }),
      review({ id: 'other', agentId: 'agent-b', findings: [finding('b.ts', 4, true)] }),
      review({
        id: 'sum',
        kind: 'summary',
        createdAt: '2026-11-29T00:00:00.000Z',
        findings: [finding('a.ts', 99)],
      }),
    ]);
    // Dismissed findings are kept here; buildSmartDiff decides what they count for.
    expect(selected).toEqual([finding('a.ts', 2), finding('b.ts', 4, true)]);
  });

  it('keys reviews without an agent by review id, so each one is kept', () => {
    const selected = selectDiffFindings([
      review({ id: 'r1', agentId: null, findings: [finding('a.ts', 1)] }),
      review({ id: 'r2', agentId: null, findings: [finding('a.ts', 2)] }),
    ]);
    expect(selected).toEqual([finding('a.ts', 1), finding('a.ts', 2)]);
  });

  it('two reviews of one agent with EQUAL createdAt → the first one read wins (current behaviour)', () => {
    const at = '2026-11-28T10:00:00.000Z';
    expect(
      selectDiffFindings([
        review({ id: 'first', createdAt: at, findings: [finding('a.ts', 1)] }),
        review({ id: 'second', createdAt: at, findings: [finding('a.ts', 2)] }),
      ]),
    ).toEqual([finding('a.ts', 1)]);
  });

  it('returns nothing for no reviews or only summaries', () => {
    expect(selectDiffFindings([])).toEqual([]);
    expect(selectDiffFindings([review({ id: 's', kind: 'summary', findings: [finding('a.ts', 1)] })])).toEqual([]);
  });
});

describe('buildSmartDiff', () => {
  it('returns all five groups in role order, files in input order, finding lines sorted unique', () => {
    const diff = buildSmartDiff(
      [
        { path: 'src/b.ts', additions: 10, deletions: 2 },
        { path: 'docs/a.md', additions: 3, deletions: 0 },
        { path: 'src/a.ts', additions: 1, deletions: 1 },
        { path: 'src/a.test.ts', additions: 4, deletions: 0 },
      ],
      [
        finding('src/b.ts', 30),
        finding('src/b.ts', 5),
        finding('src/b.ts', 30),
        finding('src/b.ts', 12, true),
        finding('src/a.test.ts', 7, true),
        finding('src/outside-pr.ts', 1),
      ],
    );

    expect(diff.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    const byRole = Object.fromEntries(diff.groups.map((g) => [g.role, g.files]));
    expect(byRole.core).toEqual([
      { path: 'src/b.ts', additions: 10, deletions: 2, finding_lines: [5, 30] },
      { path: 'src/a.ts', additions: 1, deletions: 1, finding_lines: [] },
    ]);
    expect(byRole.tests).toEqual([{ path: 'src/a.test.ts', additions: 4, deletions: 0, finding_lines: [] }]);
    expect(byRole.docs).toEqual([{ path: 'docs/a.md', additions: 3, deletions: 0, finding_lines: [] }]);
    expect(byRole.wiring).toEqual([]);
    expect(byRole.boilerplate).toEqual([]);
    // A finding on a file outside the PR creates no file entry anywhere.
    expect(diff.groups.flatMap((g) => g.files.map((f) => f.path))).not.toContain('src/outside-pr.ts');
    expect(diff.split_suggestion).toEqual({ too_big: false, total_lines: 21, proposed_splits: [] });
  });

  it('an empty PR still has all five empty groups and total_lines 0', () => {
    const diff = buildSmartDiff([], [finding('a.ts', 1)]);
    expect(diff.groups).toEqual(
      ['core', 'tests', 'wiring', 'docs', 'boilerplate'].map((role) => ({ role, files: [] })),
    );
    expect(diff.split_suggestion.total_lines).toBe(0);
  });
});
