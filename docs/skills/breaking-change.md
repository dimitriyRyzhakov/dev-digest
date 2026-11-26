---
name: breaking-change
description: Apply when a diff changes or removes anything other code depends on: exports, types, CLI flags, config keys, env vars, event payloads, public HTTP/RPC contracts. Flag each change that makes an unchanged consumer fail to compile, fail at run time or behave differently (removal, rename, narrowed input, widened output, new required argument, changed default or meaning) as CRITICAL unless the old contract stays with a deprecation path. Exception: version 0.y.z bumped to 0.(y+1).0 - WARNING.
---

# Breaking change

A **public contract** is anything a consumer outside the changed module can see and rely on:
exports listed in a package's `index.ts` / `exports` map, published types, CLI flags and exit
codes, config file keys, environment variables, event and queue payloads, webhook bodies,
database tables other services read, public HTTP/RPC routes. A change is **breaking** when a
consumer written against the old contract, left unchanged, now fails to compile, throws, gets a
different result, or silently loses data.

Rule of thumb (semver-ts): a contract may **accept more** and **return less-varied** data. It must
not **accept less** (narrowed input) or **return more-varied** data (widened output) without a
major version. A rename is a removal plus an addition: the old name is gone.

## Breaking - flag as CRITICAL

| Change | Example |
|---|---|
| Exported symbol removed or renamed | `export function parseDiff` → `parseUnifiedDiff`, no alias left |
| New required parameter, or a parameter removed / reordered | `review(diff)` → `review(diff, model)`; `(a, b)` → `(b, a)` |
| Parameter type narrowed (accepts less) | `id: string \| number` → `id: string`; `options?: Opts` → `options: Opts` |
| Return / output type widened (returns more) | `(): User` → `(): User \| null`; `Promise<T>` → `T \| Promise<T>` |
| Sync ↔ async | `getConfig(): Config` → `getConfig(): Promise<Config>` |
| Required property added to a type consumers construct | `interface ReviewInput { …; strategy: Strategy }` without `?` |
| Property removed, made optional on output, or its type changed | `user.name` removed; `email: string` → `email?: string` |
| Enum / union member removed or renamed | `'open' \| 'closed'` → `'active' \| 'closed'` |
| Static default changed | `retries = 3` → `retries = 0`; `pageSize` default 100 → 20 |
| Semantics changed under the same name and type | amount in cents → amount in units; `limit` inclusive → exclusive; IPv4 → IPv6 in the same field |
| Thrown errors or error codes changed for an existing outcome | returns `null` on miss → throws `NotFoundError`; exit code 1 → 2 |
| CLI flag, config key or env var renamed / removed | `--dry-run` → `--preview`; `DD_TOKEN` → `DEVDIGEST_TOKEN` |
| Event / message payload field renamed, removed or retyped | `{ prId }` → `{ pullId }` on a queue consumed elsewhere |
| Serialization changed | field that was omitted when empty is now sent as `null`; date `string` → epoch `number` |
| Entry point or module path removed | `exports["./client"]` dropped from `package.json` |

Severity is **CRITICAL**: consumers break with no warning, often only in production.

## Not breaking, or lower severity

| Situation | Severity |
|---|---|
| Old name kept as a `@deprecated` alias / overload / re-export next to the new one | no finding; SUGGESTION if there is no `@deprecated` note or removal plan |
| New **optional** parameter or property with a default equal to the old behaviour | no finding |
| Input widened (accepts more), output narrowed (returns less-varied) | no finding |
| New export, new route, new optional config key | no finding |
| Symbol is internal: not exported from the package entry point, marked `@internal`, under `internal/`, `_private`, or only used inside this repo **and** every caller is updated in the same diff | WARNING at most - name the callers you checked |
| Package is pre-1.0 (`"version"` in its `package.json` is `0.y.z`) **and** the diff bumps the minor (`0.7.3` → `0.8.0`), or the API is marked experimental/alpha | WARNING - SemVer allows breaks before 1.0 and `^0.7` consumers do not pick up `0.8`. Still name the break. If the same pre-1.0 diff ships the break as a **patch** (`0.7.3` → `0.7.4`) or does not bump at all, `^0.7.3` consumers receive it automatically: keep CRITICAL |
| You cannot see the old contract in the diff and only suspect a change | WARNING at most |

## How to check

1. Find the contract surface in the diff: changed lines in `index.ts` / barrel files, `export`
   statements, `.d.ts`, `package.json` (`exports`, `bin`, `main`), CLI parsers, config schemas,
   env reads (`process.env.X`), event publishers, public route handlers.
2. For each changed element, compare the old (`-`) and new (`+`) side: name, parameters and their
   order, types, optionality, defaults, thrown errors, and the documented meaning.
3. Ask: does an existing caller, unchanged, still compile and behave the same? If not, it is
   breaking.
4. Look for a compatibility path in the same diff: alias, overload, both fields returned, old
   flag still parsed, a versioned entry point. If present, it is not CRITICAL.

5. Before reporting a symbol as removed, check the `+` side: an export whose **value** changed
   but whose name is still exported is not removed. Report what actually changed.

## How to report

- Cite the changed line of the contract (the `export`, the signature, the default, the key), not
  a caller.
- State old → new and who breaks: "callers of `reviewPullRequest(input)` that do not pass
  `strategy` no longer compile".
- One finding per broken contract element. A rename that touches the declaration, the barrel and
  the docs is one finding. If another skill already reports the same element (e.g. an HTTP
  response field), do not report it twice.
- Fix: keep the old contract (alias, overload, optional parameter with the old default, both
  fields) and deprecate it, or ship the change under a major version / new entry point.

## Example

```ts
// before
export function loadConfig(path?: string): Config { … }        // default path: './devdigest.json'

// after (this diff)
export async function loadConfig(path: string): Promise<Config> { … }
```

One CRITICAL finding on the signature line: three breaks in one element - `path` became
required, the default path is gone, and the function became async, so `loadConfig().model`
now reads a property of a Promise. Fix: keep `loadConfig(path = './devdigest.json'): Config`,
add `loadConfigAsync`, and mark the sync one `@deprecated` if it should go in the next major.

## Do not flag

- Changes to private / non-exported code, tests, fixtures, comments, internal refactors that keep
  the contract identical.
- Purely additive changes.
- Formatting-only changes to a signature.
