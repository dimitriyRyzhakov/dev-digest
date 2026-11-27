# Routing: changed file → bucket → skills

Implemented in `scripts/self-review.mjs#classify` — keep this table and the code in sync.
First matching rows add up; `security` is added to every code file on top.

| Path | Bucket | Skills |
|---|---|---|
| `client/src/**/*.{ts,tsx}` (not `vendor/`) | ui | frontend-architecture, react-best-practices, next-best-practices |
| `client/src/**/*.test.{ts,tsx}` | ui | + react-testing-library |
| `client/src/vendor/**` | ui | zod |
| `server/{src,test}/**/*.{ts,sql}`, `reviewer-core/{src,test}/**/*.ts` | backend | onion-architecture |
| `…/routes.ts`, `server/src/app.ts`, `server/src/server.ts`, `server/src/platform/**` | backend | + fastify-best-practices |
| `…/repository.ts`, `…/repository/**`, `server/src/db/**` | backend | + drizzle-orm-patterns |
| `server/src/db/schema*`, `server/src/db/migrations/**` | backend | + postgresql-table-design |
| any `**/vendor/shared/**`, any TS file importing `zod` | — | + zod |
| code files: `*.{ts,tsx,js,jsx,mjs,cjs,sh,sql,json,yml,yaml}`, `Dockerfile*`, `.env*` | — | + security |
| everything else (`e2e/`, `scripts/`, docs, `messages/`, `.claude/`) | other | security if code, plus repo rules |

## Deterministic checks (script `checks`)

| Package in diff | Runs (cwd = package) |
|---|---|
| client | `pnpm typecheck` · `pnpm exec eslint --no-warn-ignored <files>` · `pnpm exec vitest related --run <files>` |
| server or reviewer-core | server: `pnpm typecheck` · `pnpm lint:arch` · `pnpm exec vitest related --run --exclude '**/*.it.test.ts' <files>` |
| reviewer-core or `server/src/vendor/shared/**` | reviewer-core: `pnpm typecheck` · `pnpm exec vitest related --run <files>` |

`lint:arch` compares against `server/.dependency-cruiser-known-violations.json`, so only new
violations fail. Integration tests (`*.it.test.ts`, Docker) stay in CI.

## Deterministic repo rules (script `scope` → `repoViolations`)

| Rule (AGENTS.md) | Severity |
|---|---|
| Existing file in `server/src/db/migrations/**` modified or deleted (`meta/_journal.json` excluded) | CRITICAL |
| `paths` / `paths-ignore` of a `.github/workflows/*.yml` changed | CRITICAL (waivable by user if task is CI) |
| One copy of `{server,client}/src/vendor/shared/<file>` changed, its twin not | HIGH |

## i18n (script `scope` → `i18n`, changed `client/src/**/*.tsx`, not tests)

| Signal | Severity |
|---|---|
| `t("key")` / `useTranslations("ns")` on an added line, key missing in `client/messages/en/<ns>.json` | HIGH |
| JSX text or `aria-label` / `title` / `placeholder` / `alt` literal on an added line | MEDIUM — UI reviewer confirms or drops |
