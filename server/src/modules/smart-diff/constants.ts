import type { SmartDiffRole } from '@devdigest/shared';

/** Display order of Smart Diff groups (core first, boilerplate last). Mirrors `SmartDiffRole.options`. */
export const SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

export interface SmartDiffRule {
  role: SmartDiffRole;
  /** Matched against the repo-relative path; first matching rule wins. */
  patterns: readonly RegExp[];
  /** Human-readable form of `patterns` (docs / UI tooltips only, never used for matching). */
  globs: readonly string[];
}

/*
 * Paths are author-controlled, so every pattern is anchored to the start of the path or a `/`
 * segment boundary, uses only `[^/]*` (never crosses a segment) and has no nested quantifiers —
 * linear on any input (ReDoS guard, see test/smart-diff-domain.test.ts). Matching is case-sensitive.
 * Directory patterns match at any depth: `(?:^|\/)dir\/`.
 */

/** Files nobody reads line by line: lock files, snapshots, generated and built output. */
const BOILERPLATE: SmartDiffRule = {
  role: 'boilerplate',
  patterns: [
    /(?:^|\/)(?:dist|build|__snapshots__)\//,
    /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/,
    /(?:^|\/)[^/]*\.(?:lock|snap)$/,
    /(?:^|\/)[^/]*\.generated\.[^/]*$/,
    /(?:^|\/)[^/]*\.min\.js$/,
  ],
  globs: [
    'dist/',
    'build/',
    '__snapshots__/',
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    '*.lock',
    '*.snap',
    '*.generated.*',
    '*.min.js',
  ],
};

/** Test code. Test directories beat docs (`e2e/README.md` is a test file). */
const TESTS: SmartDiffRule = {
  role: 'tests',
  patterns: [
    /(?:^|\/)(?:test|tests|__tests__|e2e)\//,
    /(?:^|\/)[^/]*\.test\.tsx?$/,
    /(?:^|\/)[^/]*\.spec\.ts$/,
  ],
  globs: ['test/', 'tests/', '__tests__/', 'e2e/', '*.test.ts', '*.test.tsx', '*.it.test.ts', '*.spec.ts'],
};

/** Glue: barrels, config, CI, agent config, env. */
const WIRING: SmartDiffRule = {
  role: 'wiring',
  patterns: [
    /(?:^|\/)(?:\.github|\.claude)\//,
    /(?:^|\/)index\.[jt]s$/,
    /(?:^|\/)[^/]*\.config\.[^/]*$/,
    /(?:^|\/)tsconfig[^/]*\.json$/,
    /(?:^|\/)\.eslintrc[^/]*$/,
    /(?:^|\/)\.env[^/]*$/,
    /(?:^|\/)docker-compose[^/]*\.yml$/,
  ],
  globs: [
    '.github/',
    '.claude/',
    'index.ts',
    'index.js',
    '*.config.*',
    'tsconfig*.json',
    '.eslintrc*',
    '.env*',
    'docker-compose*.yml',
  ],
};

/** Prose. */
const DOCS: SmartDiffRule = {
  role: 'docs',
  patterns: [
    /(?:^|\/)docs\//,
    /(?:^|\/)[^/]*\.md$/,
    /(?:^|\/)(?:README|CHANGELOG)[^/]*$/,
    /(?:^|\/)LICENSE$/,
  ],
  globs: ['docs/', '*.md', 'README*', 'CHANGELOG*', 'LICENSE'],
};

/** Precedence order: boilerplate → tests → wiring → docs. No match → `SMART_DIFF_FALLBACK_ROLE`. */
export const SMART_DIFF_RULES: readonly SmartDiffRule[] = [BOILERPLATE, TESTS, WIRING, DOCS];

export const SMART_DIFF_FALLBACK_ROLE: SmartDiffRole = 'core';

/**
 * Paths are author-controlled; cap what the regexes see (the longest rule is linear per segment,
 * `*.generated.*` is O(k·n) within one segment). Real repo paths are far below this.
 */
export const SMART_DIFF_MAX_PATH_CHARS = 4096;
