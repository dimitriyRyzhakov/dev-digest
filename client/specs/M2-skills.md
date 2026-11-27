# M2 — Skills in the product (client)

Server half: [server/specs/M2-skills.md](../../server/specs/M2-skills.md).

## Goal
Skills are reusable, text-only review instructions shared across agents. The user creates,
edits and imports skills on a **Skills** page, then on each agent's **Skills** tab chooses
which skills apply, in what order, and switches them on or off. Order sets the order of the
skill blocks in the agent's system prompt. The run trace shows which skills were sent and how
many tokens they cost.

User flows (same screen shape as Agents — no modals, no drawers):
1. **Skills Lab → Skills** (`/skills`) shows a card grid. Each card has the name, a type badge,
   the description and an enabled toggle, plus search and type chips.
2. Clicking a card opens `/skills/:id`. The skill list is on the left (search, **Add Skill ▾**,
   active card highlighted). On the right: header (name, type, version, "imported — untrusted
   source" badge) and tabs (`?tab=`), all inline:
   - **Config** — "Configuration" with the Enabled toggle, name, description (directive hint),
     type, markdown body with a ~token estimate, Save / Cancel / Delete.
   - **Preview** — the body rendered as the reviewing agent receives it.
   - **Versions** — body snapshots newest first (`GET /skills/:id/versions`): Current badge,
     Diff against the current body, Restore (saves that body as a new version).
   - **Stats** — used by N agents, pull frequency, runs (30d), last used, agents using the skill
     (`GET /skills/:id/stats`, counted from run traces). Accept rate / findings by category and
     the Evals tab need findings attributed to skills — they arrive with the eval milestone.
3. **Add Skill ▾** → *Create skill* opens `/skills/new` (the same inline editor, empty; after
   saving it goes to `/skills/:id`) or *Import from file* opens `/skills/import`.
4. Import (`/skills/import`, inline): pick a `.md` or `.zip`. The server parses it and the panel
   shows an editable draft, the rendered body, the **ignored files (not executed)** and a trust
   banner. Nothing is saved until **Confirm and save**, which opens the new skill.
5. **Agents → agent → Skills tab** lists every workspace skill. Each row has a drag handle, a
   checkbox, the name and a type badge, with an "N of M enabled" counter and a filter. Checking
   a row or dragging it saves at once.
6. A PR run's **Run trace → Prompt assembly** shows the "Skills" block and a per-skill token
   list.

## Scope
**In**
- Routes `/skills`, `/skills/:id`, `/skills/new`, `/skills/import`, plus a Skills nav item.
- The inline skill editor and the inline import panel (shared `SkillsWorkspace` frame).
- The agent editor Skills tab (`?tab=skills`), with drag and keyboard (Alt+↑/↓) reorder.
- `AgentCard` skill count from `agent.skill_count`.
- Per-skill tokens in `TraceBody`.
- Hooks in `src/lib/hooks/skills.ts`, i18n keys, unit and component tests.

**Out**
- Import from URL and the community catalog (their message keys stay unused).
- The agent "Context" tab, skill version history UI, skill evals.

## UX details
- The description field hint reads: *"This is the skill's interface. Write it as a directive:
  when to apply the skill and what to flag."*
- The type options come from `SkillType.options` (runtime import from
  `@devdigest/shared/contracts/knowledge`, not the barrel).
- Type colours: rubric = accent, convention = ok, security = crit, custom = muted.
- In edit mode, a changed body shows "Saving a changed body creates a new version".
- An imported skill (`source = imported_file`) shows an "imported — untrusted source" badge in
  the editor header.
- The import trust banner reads: *"An imported skill is someone else's instructions. Its text
  becomes part of your agents' prompts. Read it before saving. Scripts and other executable
  files are never run."*
- Agent Skills tab:
  - Rows are linked rows by `order`, then unlinked rows by name.
  - A skill disabled globally is muted with "disabled globally" (it can be linked, but it is not
    injected).
  - Every change sends the full ordered list `links: [{skill_id, enabled}]` and is applied
    optimistically.

## Data
| Hook | Request |
|---|---|
| `useSkills()` | `GET /skills` |
| `useCreateSkill()` | `POST /skills` |
| `useUpdateSkill()` | `PATCH /skills/:id` |
| `useDeleteSkill()` | `DELETE /skills/:id` |
| `useImportSkillPreview()` | `POST /skills/import/preview` |
| `useAgentSkills(agentId)` | `GET /agents/:id/skills` |
| `useSetAgentSkills()` | `POST /agents/:id/skills` (optimistic; invalidates the agents list for `skill_count`) |

## Acceptance criteria
- A skill can be created and edited in the UI. The version increases when the body changes.
- Import of a `.zip` with `SKILL.md` + `scripts/check.sh` shows the preview and lists the
  script as ignored. Cancel saves nothing; Confirm saves.
- The Skills tab links, enables/disables and reorders skills. A reload shows the same state.
- Both new agents (Test Quality Reviewer, API Contract Reviewer) have linked skills.
- In a run trace, an enabled skill is visible as its own block with tokens, and a disabled one
  is absent.
- The control experiment reproduces on both agents (see `docs/skills/experiments/README.md`).
