// Flag ALLOWLISTS for the test tools the restricted agents may run (test-writer, architecture-reviewer,
// plan-verifier). A denylist missed write-capable flags twice (vitest `--output-file`, eslint
// `--suppress-all --suppressions-location`), so only the flags below pass; anything else is blocked.
// Positional arguments (file filters) are allowed; the caller checks them as paths if it needs to.

const VITEST_BOOL = new Set(['--run', '--silent', '--passWithNoTests', '--no-color', '--no-file-parallelism', '--hideSkippedTests']);
const VITEST_VALUE = new Set(['--exclude', '-t', '--testNamePattern', '--project', '--bail', '--reporter', '--retry', '--testTimeout']);
const VITEST_REPORTERS = new Set(['default', 'verbose', 'dot', 'basic', 'tap', 'tap-flat', 'hanging-process']);

const ESLINT_BOOL = new Set(['--no-warn-ignored', '--quiet', '--no-color', '--color', '--no-error-on-unmatched-pattern']);
const ESLINT_VALUE = new Set(['--max-warnings', '-f', '--format']);
const ESLINT_FORMATS = new Set(['stylish', 'json', 'compact', 'unix']);

function checkFlags(tool, args, bool, value, check) {
  for (let i = 0; i < args.length; i++) {
    // Words may still carry shell quotes (`'--output-file=x'`): strip them before matching.
    const a = args[i].replace(/['"]/g, '');
    if (a === '--') continue;
    if (!/^--?[A-Za-z0-9]/.test(a)) continue;
    const eq = a.indexOf('=');
    const name = eq === -1 ? a : a.slice(0, eq);
    if (bool.has(name) && eq === -1) continue;
    if (value.has(name)) {
      const v = eq === -1 ? args[++i] : a.slice(eq + 1);
      if (v === undefined) return `${tool} ${name} needs a value.`;
      const r = check(name, v);
      if (r) return r;
      continue;
    }
    return `${tool} flag ${a} is not on the allowlist (${[...bool, ...value].join(', ')}).`;
  }
  return null;
}

/**
 * vitest args after the subcommand: `run …` or `related --run …`. Returns a reason or null.
 * Blocks watch mode (`related` without `--run`, bare `vitest`) and every unlisted flag.
 */
export function vitestArgsReason(args) {
  const [sub, ...rest] = args;
  if (sub !== 'run' && sub !== 'related') return 'only `vitest run …` and `vitest related --run …` are allowed.';
  if (sub === 'related' && !rest.includes('--run')) return 'vitest related without --run starts watch mode; add --run.';
  return checkFlags('vitest', rest, VITEST_BOOL, VITEST_VALUE, (name, v) =>
    name === '--reporter' && !VITEST_REPORTERS.has(v) ? `vitest --reporter=${v}: only built-in console reporters.` : null);
}

/** Extra args passed to a package `test` script (`pnpm test …`, `npm test -- …`) — vitest flags only. */
export function testScriptArgsReason(args) {
  return checkFlags('test', args, VITEST_BOOL, VITEST_VALUE, (name, v) =>
    name === '--reporter' && !VITEST_REPORTERS.has(v) ? `--reporter=${v}: only built-in console reporters.` : null);
}

/** eslint args: read-only flags only; `--format` limited to built-ins (a path would load code). */
export function eslintArgsReason(args) {
  return checkFlags('eslint', args, ESLINT_BOOL, ESLINT_VALUE, (name, v) =>
    (name === '-f' || name === '--format') && !ESLINT_FORMATS.has(v) ? `eslint ${name} ${v}: only built-in formatters.` : null);
}

// ---- git (read-only subcommands) -----------------------------------------------------------------
// git accepts unambiguous ABBREVIATIONS of long options (`--untrac` = `--untracked`, `--conte=` =
// `--contents=`, `--open=` = `--open-files-in-pager`), so a denylist of full names is bypassable.
// Only the exact spellings below pass; an abbreviation is not in the set and is blocked.

const GIT_COMMON_BOOL = ['--no-color', '--no-pager', '--stat', '--shortstat', '--numstat', '--name-only', '--name-status',
  '--oneline', '-p', '--patch', '--no-patch', '-s', '-w', '--ignore-all-space', '-b', '--ignore-space-change',
  '--word-diff', '--abbrev-commit', '--no-abbrev-commit', '--cached', '--staged', '-M', '--find-renames', '--summary',
  '--compact-summary', '--raw', '--no-renames', '--minimal', '--histogram', '--patience'];
const GIT_COMMON_VALUE = ['--unified', '--format', '--pretty', '--color', '--diff-filter', '--stat-width', '--relative'];

const GIT_FLAGS = {
  diff: { bool: [...GIT_COMMON_BOOL, '--merge-base', '--exit-code', '--quiet', '-R'], value: GIT_COMMON_VALUE },
  show: { bool: [...GIT_COMMON_BOOL, '--quiet'], value: [...GIT_COMMON_VALUE, '--date'] },
  log: {
    bool: [...GIT_COMMON_BOOL, '--follow', '--reverse', '--graph', '--decorate', '--no-decorate', '--all', '--first-parent',
      '--merges', '--no-merges', '--left-right', '--cherry-pick', '--date-order', '--topo-order', '-i', '--regexp-ignore-case',
      '--all-match', '--invert-grep', '-E', '--extended-regexp', '-F', '--fixed-strings'],
    value: [...GIT_COMMON_VALUE, '--max-count', '--skip', '--since', '--after', '--until', '--before', '--author',
      '--committer', '--grep', '--date', '--decorate'],
  },
  status: { bool: ['-s', '--short', '--porcelain', '-b', '--branch', '--long', '--no-renames', '--ahead-behind', '--no-ahead-behind'], value: ['--porcelain', '--untracked-files'] },
  'ls-files': { bool: ['-o', '--others', '--exclude-standard', '-c', '--cached', '-m', '--modified', '-d', '--deleted', '--error-unmatch', '--full-name', '-s', '--stage'], value: [] },
  'rev-parse': { bool: ['--show-toplevel', '--abbrev-ref', '--verify', '--short', '--is-inside-work-tree', '--show-prefix', '--git-common-dir', '--symbolic-full-name', '-q', '--quiet'], value: ['--short'] },
  grep: {
    bool: ['-n', '--line-number', '-i', '--ignore-case', '-l', '--files-with-matches', '-L', '--files-without-match', '-c', '--count',
      '-E', '--extended-regexp', '-F', '--fixed-strings', '-P', '-w', '--word-regexp', '-v', '--invert-match', '-h', '-H',
      '--heading', '--break', '-I', '--cached', '--full-name', '-q', '--quiet', '--all-match', '--column', '-o', '--only-matching'],
    value: ['--max-count', '--context', '--before-context', '--after-context', '--max-depth'],
  },
  blame: { bool: ['-w', '-M', '-C', '-e', '--show-email', '-s', '-l', '-t', '--porcelain', '--line-porcelain', '-f', '--show-name', '-n', '--show-number', '--root'], value: ['--date'] },
};
// Short options that take an attached or following value: -U3, -n5, -A2, -G<re>, -S<s>, -L1,9, -e <pat>.
const GIT_SHORT_VALUE = { diff: ['-U', '-G', '-S'], show: ['-U', '-G', '-S'], log: ['-U', '-n', '-G', '-S'], grep: ['-e', '-A', '-B', '-C', '-m'], blame: ['-L'] };

/** Reason string, or null when every flag of `git <sub> <args>` is on that subcommand's allowlist. */
export function gitArgsReason(sub, args) {
  const spec = GIT_FLAGS[sub];
  if (!spec) return `git ${sub} is not on the read-only allowlist (${Object.keys(GIT_FLAGS).join(', ')}).`;
  const bool = new Set(spec.bool);
  const value = new Set(spec.value);
  const shortValue = GIT_SHORT_VALUE[sub] ?? [];
  for (let i = 0; i < args.length; i++) {
    // Words may still carry shell quotes (`'--output=x'` is --output=x to the shell): strip them first.
    const a = args[i].replace(/['"]/g, '');
    if (a === '--') break; // the rest are pathspecs; the caller checks them as paths
    // A flag starts with -X / --X; pieces of a quoted pattern (`->`, masked chars) are not flags.
    if (!/^--?[A-Za-z0-9]/.test(a)) continue;
    if (/^-\d+$/.test(a) && sub === 'log') continue; // git log -5
    const eq = a.indexOf('=');
    const name = eq === -1 ? a : a.slice(0, eq);
    if (eq === -1 && bool.has(name)) continue;
    if (value.has(name)) {
      // Long value options only as `--x=value`. Several (--color, --pretty, --relative, --unified)
      // take an OPTIONAL value that git never reads from the next word — skipping that word here
      // would let `--color --output=x` through. So the checker never skips a word for a long option.
      if (eq === -1) return `git ${sub} ${name}: write it as ${name}=<value>.`;
      continue;
    }
    // -U[<n>] has an optional value: only the attached form counts, `-U` alone is a bare flag.
    if (a === '-U') continue;
    const sv = shortValue.find((p) => a.startsWith(p));
    if (sv) {
      if (a === sv) i++; // required value (-n 5, -e <pat>, -A 2, -L 1,9, -G <re>) in the next word
      continue;
    }
    return `git ${sub} flag ${a} is not on the allowlist (exact spellings only — git also accepts abbreviations, so they are blocked).`;
  }
  return null;
}
