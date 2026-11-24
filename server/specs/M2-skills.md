# M2 — Skills in the product (server)

UI half: [client/specs/M2-skills.md](../../client/specs/M2-skills.md).
Engine half: [reviewer-core/specs/M2-skills-in-system-prompt.md](../../reviewer-core/specs/M2-skills-in-system-prompt.md).

## Goal
A **skill** is a reusable, text-only block of review instructions: `name`, `description`,
`type` (`rubric | convention | security | custom`) and a markdown `body`. Skills are stored
once per workspace and linked to any number of agents. Each link has its own position and
its own on/off switch. When an agent runs, its enabled skills are appended to its **system**
message in link order, and the run trace shows them as a separate block with a token count
per skill.

The database is the source of truth. Skills carry no code: nothing in a skill is ever executed.

## Scope
**In**
- CRUD over `skills` (`/skills`), workspace-scoped, with body versioning in `skill_versions`.
- Import preview from a `.md` file or a `.zip` (Agent-Skill layout: `SKILL.md` + other files).
  The preview persists nothing. Saving is a normal `POST /skills` with `source: 'imported_file'`.
- Per-agent links with `order` and `enabled` (`/agents/:id/skills`).
- The run executor passes enabled skills to the engine. The trace gets `skill_blocks` with
  per-skill tokens.
- Two new seeded agents: **Test Quality Reviewer** and **API Contract Reviewer**, with no
  skills linked.

**Out**
- Import from URL and the community catalog.
- Bumping the agent version when its links change.
- Skill evals, `.tar.gz` archives.

## API / data changes
### Migration (generated, `0011_*`)
- `agent_skills.enabled boolean NOT NULL DEFAULT true`.
- Unique index `skills_workspace_name_uq` on `skills(workspace_id, name)`.

### Contracts (`src/vendor/shared/contracts`, mirrored to client)
- `SkillSource` gains `'imported_file'`.
- `SkillInput { name 1-80, description 1-500, type, body 1-20000, source? }`
  and `SkillPatch` (partial `SkillInput` + `enabled`).
- `AgentSkillLink { agent_id, skill_id, order, enabled }`.
- `SkillImportPreview { name, description, type, body, source_file, ignored_files[{path, reason}], warnings[] }`.
- `Agent.skill_count?: number`: the count of enabled links (list and detail).
- `PromptAssembly.skill_blocks?: { skill_id, name, version, tokens }[] | null`. It is nullish so
  traces stored before M2 still parse.

### Routes
| Method | Path | Notes |
|---|---|---|
| GET | `/skills` | all workspace skills, by name |
| GET | `/skills/:id` | 404 outside the workspace |
| POST | `/skills` | `SkillInput`; 409 on a duplicate name |
| PATCH | `/skills/:id` | `SkillPatch`; a changed body bumps `version` and stores a `skill_versions` row (one tx) |
| DELETE | `/skills/:id` | links cascade |
| GET | `/skills/:id/versions` | `SkillVersion[]` from `skill_versions`, newest first; 404 outside the workspace |
| GET | `/skills/:id/stats` | `SkillStats`: linked agents by name, `used_by` = enabled links, `runs_30d` / `last_used_at` from runs whose trace `skill_blocks` contains the skill (jsonb `@>`), `pull_rate` = % of the linked agents' 30-day runs that included it (null without runs); 404 outside the workspace |
| POST | `/skills/import/preview` | `{ filename, content_base64 }`, route `bodyLimit` 3 MB → `SkillImportPreview`, **no writes** |
| GET | `/agents/:id/skills` | `AgentSkillLink[]` in order |
| POST | `/agents/:id/skills` | `{ links: [{skill_id, enabled}] }` replaces the whole ordered set (tx). The legacy `skill_ids` / `skill_id` forms still work. Skills from another workspace → 404 |

### Import rules
The archive is read **in memory** only: no fs writes, no exec.
- **`.md`**: the frontmatter gives `name` / `description`. The body is the text without its
  frontmatter. The name falls back to the file name.
- **`.zip`**: the shallowest `SKILL.md` is the skill. Without one, a single `.md` file is used.
  Anything else is an error.
- Every other entry is listed as `ignored` with a reason and is **never inflated**. That includes
  executable extensions (`.sh .bash .py .js .mjs .cjs .ts .rb .pl .ps1 .bat .cmd .exe .bin .so .dll`),
  anything under `scripts/` or `bin/`, binary or non-UTF-8 files, and oversize files.
- Limits: zip ≤ 2 MB, ≤ 200 entries, declared uncompressed total ≤ 10 MB (zip-bomb guard),
  skill file ≤ 64 KB.

### Prompt and trace
- Injected skills = linked **and** `agent_skills.enabled` **and** `skills.enabled`, in link order.
- The engine renders them into the system message between the agent prompt and the injection
  guard (see the engine spec).
- `prompt_assembly.skills` holds the rendered block.
- `prompt_assembly.skill_blocks` holds one entry per skill, with tokens counted by
  `container.tokenizer` on that skill's rendered block.
- The run log gets `Skills attached: N (names)`.

### Trust model
An imported skill is someone else's instructions inside your agent's prompt. It is saved only
after the user reads a preview and confirms it. The preview lists every ignored file, and the
source is stored as `imported_file` so the UI can mark it. Nothing executable is unpacked or run.

## Acceptance criteria
- A skill can be created, edited (body change → `version + 1` and a `skill_versions` row),
  toggled and deleted through the API.
- `POST /skills/import/preview` with a `.zip` holding `SKILL.md` + `scripts/check.sh` returns
  the skill and lists `scripts/check.sh` as ignored. The `skills` row count is unchanged.
- `POST /agents/:id/skills` with `links` stores order and enabled. `GET` returns them in order.
- A review run's system message contains every enabled linked skill, in link order. A disabled
  link or a globally disabled skill is absent.
- The run trace has `prompt_assembly.skills` and `skill_blocks` with `tokens > 0`.
- The seed creates Test Quality Reviewer and API Contract Reviewer (idempotent).
- No new outbound calls.
