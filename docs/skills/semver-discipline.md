---
name: semver-discipline
description: Apply ONLY when the diff changes a version signal (package.json "version", a changeset, a CHANGELOG entry, a VERSION file); with none in the diff, report nothing. Required bump: MAJOR for any incompatible change (0.y.z: at least 0.(y+1).0), MINOR for additions and deprecations, PATCH for compatible fixes. Declared bump lower than required - CRITICAL on the version line; deprecation or feature as PATCH, or MAJOR without migration notes - WARNING.
---

# SemVer discipline

SemVer 2.0.0: `MAJOR.MINOR.PATCH`.

- **MAJOR** - any backward-incompatible change to the public API. Resets minor and patch.
- **MINOR** - new backward-compatible functionality, **and** whenever something public is marked
  deprecated. Resets patch.
- **PATCH** - backward-compatible bug fixes only (internal change that fixes wrong behaviour).
- `0.y.z` - anything may change, but npm/pnpm `^0.3.1` treats each `0.y` as incompatible, so a
  break in `0.y.z` needs at least a **minor** bump (`0.3.1` → `0.4.0`), never a patch.
- A released version is immutable. A fix to a bad release is a new version.

The version in this diff must be **at least** the highest bump any change in the diff requires.

## Scope gate - read first

This skill reports **only** about version signals that appear in the diff: a changed `"version"`,
a changeset file, a CHANGELOG / release-notes entry, a `VERSION` file or constant.

- **No version signal in the diff → report nothing from this skill.** Many repos bump at release
  time; "missing major bump" on a PR that does not touch the version is noise. The breaking change
  itself is reported by other rules (breaking-change, route and schema skills), not here.
- Never report "removed without deprecation" or "breaking change" again as a separate finding:
  if another rule already reported the contract change, this skill adds only the version
  finding, cited on the version line.
- Do not ask for a changeset / migration note when the diff shows no changeset or changelog at
  all.

## What requires MAJOR

- Removing or renaming an export, entry point (`exports`, `main`, `bin`), CLI flag, config key or
  env var.
- Narrowing accepted input or widening returned output of a public function or type: new required
  parameter, parameter type narrowed, return type gains `null` / `undefined`, required property
  added to a type users construct, property made optional or removed.
- Removing or renaming an enum / union member; changing a default value or the meaning of an
  existing field (units, format, inclusive/exclusive).
- Breaking HTTP/RPC contract changes in a versioned API (removed/renamed fields or params, new
  required request field, changed status codes) without a new API version.
- Dropping a supported runtime or toolchain: raising `engines.node`, dropping a TypeScript version
  from the support policy, switching to ESM-only, raising a `peerDependencies` range to a new major.
- Changing thrown errors or error codes callers handle.

## What is MINOR

- New exports, new optional parameters/properties with defaults matching old behaviour, new routes,
  new optional config keys.
- Widening accepted input, adding enum values to request-side enums.
- **Deprecations** (`@deprecated`, deprecation warnings / headers) - the API still works.

## What is PATCH

- Bug fixes that keep the contract; performance work; internal refactors; docs; dependency bumps
  that do not change the public API.

## What to flag

| Situation (visible in the diff) | Severity |
|---|---|
| Version bumped MINOR or PATCH (in `package.json`, a changeset `'pkg': minor`, `version` const, chart/manifest version) while the diff contains a MAJOR-level change | CRITICAL |
| `0.y.z` package: a breaking change shipped as a PATCH bump | CRITICAL |
| A deprecation, or a new feature, shipped as PATCH | WARNING |
| Breaking change, the diff adds a `.changeset/*.md` (or edits `CHANGELOG.md` for this release) but marks it `minor` / `patch` or says nothing about the break | WARNING - the release tool will cut the wrong version |
| MAJOR bump with no migration note (CHANGELOG / changeset / release notes say what broke and how to upgrade) | WARNING |
| MAJOR bump where you can find no incompatible change | SUGGESTION - may be intended, ask |
| Version jumps or resets oddly (`1.4.2` → `1.6.0`, `2.0.0` → `1.9.0`, minor not reset to 0 after major) | WARNING |
| Lockfile-only or internal-only diff with no version change | no finding |
| Public contract changed but the repo shows no versioning at all (no version field, no changesets, private app) | no finding - this skill does not apply |

## How to check

1. Find the version signals in the diff: `"version"` in `package.json`, `.changeset/*.md`,
   `CHANGELOG.md`, `VERSION` files, exported `version` constants, API version prefixes (`/v1`).
2. Find the highest-impact contract change in the same diff (use the MAJOR / MINOR / PATCH lists
   above; other skills such as breaking-change may already name it).
3. Compare: required bump vs declared bump. Pre-1.0 packages shift the rule one level down
   (break → minor) but a patch is never enough for a break.

## How to report

- Cite the version line (`"version": "1.4.0"` or the changeset `minor` line). If the version is
  not in the diff but a changeset should be, cite the breaking contract line.
- Say which change requires which bump: "removes export `parseDiff` → requires 2.0.0; diff bumps
  1.3.2 → 1.4.0".
- Fix: the exact version (`2.0.0`), the changeset type (`major`), a `BREAKING CHANGE:` footer,
  or a compatibility shim that keeps the change minor.

## Example

```diff
// package.json
-  "version": "1.3.2",
+  "version": "1.4.0",
// src/index.ts
-export { parseDiff, parseUnifiedDiff } from './diff.js';
+export { parseUnifiedDiff } from './diff.js';
// CHANGELOG.md
+## 1.4.0
+- Removed deprecated `parseDiff`.
```

One CRITICAL on the version line: `parseDiff` was removed, which requires `2.0.0`; `1.4.0`
lets every `^1.3.2` consumer pick up a build that no longer exports it. Fix: release as `2.0.0`
with a migration note ("replace `parseDiff` with `parseUnifiedDiff`"), or keep `parseDiff` as a
deprecated alias and ship `1.4.0`.
