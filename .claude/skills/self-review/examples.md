# Self-review examples

## `.claude/self-review/report.json`

```json
{
  "fingerprint": "e2bdf3dcccdc…",
  "base": { "ref": "origin/main", "sha": "0025326ebd412c722b29e654e54b7492c2447716" },
  "verdict": "BLOCK",
  "createdAt": "2026-11-24T14:05:00.000Z",
  "checks": [
    { "package": "client", "check": "typecheck", "ok": true },
    { "package": "client", "check": "eslint", "ok": true },
    { "package": "server", "check": "lint:arch", "ok": false }
  ],
  "findings": [
    {
      "id": "frontend-architecture:client/src/app/repos/[repoId]/_components/RepoHeader/RepoHeader.tsx:18",
      "severity": "CRITICAL",
      "source": "skill",
      "skill": "frontend-architecture",
      "rule": "CRITICAL — dependency direction",
      "file": "client/src/app/repos/[repoId]/_components/RepoHeader/RepoHeader.tsx",
      "line": 18,
      "problem": "Component calls fetch('/api/repos') directly (L4 → L2).",
      "fix": "Move the request into a useRepo() hook backed by the API client and query keys.",
      "preExisting": false,
      "verified": true
    },
    {
      "id": "i18n:client/src/app/settings/_components/SaveBar.tsx:12:Hardcoded UI text \"Save changes\".",
      "severity": "MEDIUM",
      "source": "i18n",
      "rule": "i18n: user-visible strings live in client/messages/en",
      "file": "client/src/app/settings/_components/SaveBar.tsx",
      "line": 12,
      "problem": "Hardcoded UI text \"Save changes\".",
      "fix": "Use t(\"actions.saveChanges\") from messages/en/settings.json.",
      "preExisting": false
    }
  ],
  "waivers": []
}
```

Rules: `fingerprint` and `base` are copied from `scope` output, never invented. A waiver needs the
user's exact words: `{"id": "repo:workflow-paths:.github/workflows/client.yml", "reason": "task is CI", "userQuote": "так, міняємо фільтри — це CI-задача"}`.

## Good vs bad finding

- Good: `server/src/modules/reviews/routes.ts:41` CRITICAL onion-architecture › "CRITICAL — dependency
  direction": route imports `db` from `src/db/client` and runs a query. Fix: call `reviewsService.list()`.
- Bad: "Consider extracting this into a helper for readability" — no skill rule behind it → not a finding.
- Bad: CRITICAL on a line that is not in the diff → mark `preExisting: true`, it does not block.

## Chat report

```
Self-review: BLOCK — 2 CRITICAL · 1 HIGH · 3 MEDIUM   (base origin/main@0025326, 14 files)

Checks: client typecheck ✓ eslint ✓ vitest ✓ · server typecheck ✓ lint:arch ✗ vitest ✓

| Sev | Where | Rule | Problem → fix |
|---|---|---|---|
| CRITICAL | server lint:arch | routes-no-persistence | reviews/routes.ts → src/db/client → move query to service |
| CRITICAL | RepoHeader.tsx:18 | frontend-architecture › dependency direction | fetch in component → useRepo() hook |
| HIGH | vendor/shared/contracts/review.ts:1 | shared drift | client copy not updated → mirror |

Pre-existing (not blocking): AgentCard.tsx:88 inline object in deps.
PR not opened. Fix the CRITICAL items, then re-run self-review.
```

## `.claude/self-review/summary.md` (APPROVE only — goes into the PR body)

```markdown
## Self-review
Verdict: **APPROVE** · base `origin/main@0025326` · fingerprint `e2bdf3dc`
Checks: client typecheck ✓ eslint ✓ vitest ✓ · server typecheck ✓ lint:arch ✓ vitest ✓
Skills: frontend-architecture, react-best-practices, next-best-practices, onion-architecture, zod, security
Warnings: 1 HIGH, 2 MEDIUM
- `client/src/app/agents/_components/AgentCard/AgentCard.tsx:42` HIGH react-best-practices › Hooks — effect syncs derived state
- `client/src/app/global-error.tsx:10` MEDIUM i18n — hardcoded text (global error boundary renders outside the intl provider)
```
