# e2e — insights

Append-only. Written via the `engineering-insights` skill (.claude/skills/engineering-insights). One insight per bullet.
Format: `- YYYY-MM-DD — <context/trigger> → <what to do instead> (evidence: path#symbol | command)`
Never edit or delete entries; correct with a new dated `supersedes …` entry.

## What Works
<!-- approaches and solutions that worked here -->

## What Doesn't Work
<!-- dead ends and antipatterns, with why — the most valuable section -->
- 2026-11-24 — `find text <X> click` right after `wait --url` → flaky: `find` does not wait, so it can hit the PR list while it still shows skeletons (async fetch + GitHub sync attempt); ALWAYS put `wait --text <X>` before a `find … click` on async data (evidence: e2e/specs/02-repo-pulls-detail.flow.json, test-results/*-fail.png)
- 2026-11-26 — Clicking the n-th `button "Accept"` on /conventions → an accepted card KEEPS the label "Accept" (only the style changes), so the "next" Accept hits the wrong card; also `wait --text` on the scan toast fired before the scan finished → pick buttons inside the `article` whose name is the rule text, and wait until the toolbar button reads "Re-scan" again (not "Scanning…") (evidence: client/src/app/repos/[repoId]/conventions/_components/ConventionCard/ConventionCard.tsx)

## Codebase Patterns
<!-- conventions and architecture decisions, with the reason -->

## Tool & Library Notes
<!-- dependency / CLI quirks -->
- 2026-11-26 — Recording a demo video with `agent-browser record start x.mp4` → needs `ffmpeg` on PATH (`brew install ffmpeg`); at the default 30 fps on 1440×900 the encoder "fell more than 500 ms behind" and left an unplayable mp4 (`moov atom not found`) → record with `--fps 15` and check the file with `ffprobe` before sending (evidence: e2e/test-results/m2-conventions-demo.mp4)

## Recurring Errors & Fixes
<!-- error message → fix -->
- 2026-11-24 — `npm run e2e:hermetic` ends `sh: tsx: command not found` (exit 127) → e2e has its own deps: `npm install` in e2e/, plus once `npm i -g agent-browser && agent-browser install`; also stop `pnpm dev` in client/ first — the script starts a 2nd `next dev` there that shares `.next/` (evidence: scripts/e2e.sh)

## Session Notes
<!-- ### YYYY-MM-DD + 1–3 bullets: what was done, what was decided -->

## Open Questions
<!-- still unclear; move out once answered -->
