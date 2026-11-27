# M2 — Conventions extractor (client)

Server half: [server/specs/M2-conventions.md](../../server/specs/M2-conventions.md).

## Goal
A **Conventions** page per repo. The user scans the cloned repo for house rules and checks each
candidate against its evidence. They accept, reject or edit candidates, then turn the accepted
ones into one skill through a **Create skill from conventions** modal. That skill is then linked
to an agent on its Skills tab, like any other skill.

User flows:
1. **Skills Lab → Conventions** (`/repos/:repoId/conventions`).
   - Header: "Conventions in **{repo}**".
   - Subtitle: candidate count · last scan (relative time).
   - **Re-scan** button, top right. With no candidates, the empty state shows **Run extraction**
     instead.
2. **Run extraction / Re-scan** calls `POST /repos/:id/conventions/extract`.
   - While it runs, the button shows "Scanning…" and is disabled.
   - Afterwards a toast reports how many candidates were found and how many were dropped for
     missing evidence. On failure the toast reads "Extraction failed".
3. Each **candidate card** has:
   - the rule (italic). Click to edit inline; Enter or blur saves (`PATCH`), Esc cancels.
   - an evidence block:
     - header `path:start-end` linking to the file on GitHub at the default branch, with the
       line anchor, in a new tab
     - a copy button
     - the snippet in a mono block
   - a confidence bar with a percentage: green ≥ 85%, amber ≥ 65%, red below.
   - **Accept** / **Reject** buttons on the right. Accepted shows as a filled primary button
     "✓ Accepted" plus a green left border on the card. Clicking a pressed button sets the
     candidate back to `pending`. Rejected cards are dimmed.
4. The toolbar above the list shows **Deselect all** (every accepted one back to pending),
   "N of M accepted" and a primary **Create skill** (disabled at 0 accepted).
5. **Create skill** opens the modal "Create skill from conventions":
   - subtitle: the skill name
   - info banner: "Merged from **N accepted conventions** in {repo}. Everything below is editable
     before you save."
   - fields:
     - Name (default `<repo>-conventions`)
     - Description (default "N house conventions extracted from {repo}")
     - Type `convention` (shown, not changeable)
     - Enabled toggle ("Whether this block is added to agents' prompts.")
     - Skill body: markdown editor with a file-name header, an "unsaved" badge and a `~N tokens`
       counter
   - footer: hint "Saved as v1 · added to Skills Lab", **Cancel** and **Create skill**.
   - Save → `POST /repos/:id/conventions/skill`. Then: a toast with the saved version (the server
     returns a new version when the name already belongs to an extracted skill), the modal closes,
     the skills cache is invalidated. A 409 shows inline under Name.

Draft body (built on the client from the accepted candidates; editable):
````md
# payments-api-conventions

House conventions for `payments-api`. Flag changes that violate any rule below and cite the offending `file:line`.

## async-await-then-chains
Always use async/await instead of .then() chains.

Detected in `src/api/users.ts:23-31`:
```ts
const user = await db.users.find(id);
```
````

## Scope
**In**
- Route `app/repos/[repoId]/conventions/page.tsx` (thin) → `_components/ConventionsView`.
- Components:
  - `ConventionsView`
  - `ConventionCard`
  - `ConventionsToolbar`
  - `CreateConventionSkillModal`
  - helper `buildSkillDraft`
- A **Skills Lab** sidebar section with a new **Conventions** nav item. This is an **approved
  exception** to "do not touch `src/vendor/ui`": it changes only the `NAV` data, and no primitive
  changes. `Sidebar.tsx` already renders each group's `section` as its heading.
  - `src/vendor/ui/nav.ts` → `NAV` becomes two groups:
    ```ts
    { section: "WORKSPACE", items: [pulls] },
    { section: "SKILLS LAB", items: [
      skills,
      agents,
      { key: "conventions", label: "Conventions", icon: "ListChecks", href: "/repos/:repoId/conventions", gKey: "c" },
    ] },
    ```
  - `pulls`, `skills` and `agents` keep their current definitions, only regrouped. The order
    follows the mockup: Skills, Agents, Conventions.
  - In `SHORTCUTS`: `{ keys: "g c", label: "Go to Conventions", group: "Navigation" }`.
  - `:repoId` is filled from the active repo by `resolveHref`. With no active repo it resolves to
    `_`, as Pull Requests does.
  - `components/app-shell/helpers.ts` already maps `/conventions` → `"conventions"` for the
    highlight.
  - `messages/en/shell.json` already has `nav.conventions`, which the command palette's "Go to
    Conventions" uses. `useGlobalShortcuts` and `useShellCommands` flatten all groups, so the
    regrouping changes nothing there.
- Hooks in `src/lib/hooks/conventions.ts`:
  - `conventionKeys`
  - `useConventions`
  - `useExtractConventions`
  - `usePatchConvention` (optimistic)
  - `useSaveConventionSkill`
- The modal builds its own fields from the UI kit. Its layout (Type next to Enabled, a file header
  over the body) differs from `SkillFields`, so nothing moves between routes. Only
  `estimateTokens` is shared: it moves to `src/lib/skills.ts`, and `SkillFields/helpers.ts`
  re-exports it.
- New keys in `messages/en/conventions.json`: reject, edit, deselect all, accepted count, toast
  texts, modal.
- Contract mirror of the server's `knowledge.ts` Conventions section.

**Out**
- Per-candidate skills, bulk endpoints, scan history, streaming progress.
- Linking from this page. The link stays on the agent's Skills tab.

## API / data changes
None of its own. It consumes the server routes and contracts from the server spec
(`ConventionList`, `ConventionPatch`, `ConventionExtractResult`, `ConventionSkillInput`).

## Acceptance criteria
- The sidebar has two sections: **WORKSPACE** (Pull Requests) and **SKILLS LAB** (Skills, Agents,
  Conventions). The links and `g p` / `g s` / `g a` shortcuts behave as before. **Conventions**
  (ListChecks icon) comes after Agents. With a repo selected it opens
  `/repos/:repoId/conventions`, and it is highlighted on that page. `g c` also navigates there.
- The empty state shows **Run extraction**. After a run, the cards show the rule, `path:lines`,
  the snippet and the confidence.
- The evidence header opens `https://github.com/{full_name}/blob/{default_branch}/{path}#L{a}-L{b}`.
- Accept / Reject / edit each send one `PATCH` and update the card at once. The counter and the
  enabled state of Create skill follow along.
- Re-scan keeps the accepted cards.
- The modal is prefilled from the accepted candidates. Name, description, body and Enabled are
  editable before saving. Saving creates (or versions) a `convention` / `extracted` skill that is
  visible on `/skills`.
- Component tests:
  - `buildSkillDraft`
  - `ConventionCard` (accept, reject, edit → patch)
  - `CreateConventionSkillModal` (prefill, edited values sent, 409 shown)
- `pnpm typecheck`, `pnpm test` and `pnpm lint` are green. The page has been loaded once in the
  browser.
