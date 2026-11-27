# Product skills

Source files for the **skills** that DevDigest review agents use (roadmap M2). A skill is a
reusable, narrow block of review instructions. It is linked to one or more agents, ordered and
enabled per agent, and appended to the agent's system prompt at review time (see
[How a prompt is assembled](../agent-prompts/README.md#how-a-prompt-is-assembled)).

Keep the agent prompt general (role, severity rubric, verdict, findings discipline) and put each
narrow, reusable check into a skill.

## Format

A skill is one markdown file with YAML frontmatter:

```markdown
---
name: test-branch-coverage
description: Apply when a diff adds or changes branching logic. Flag every new branch … the changed tests do not exercise.
---

# Body: what to flag, at which severity, with examples
```

| Field | Rule |
|---|---|
| `name` | Short kebab-case id, 1–80 chars. Falls back to the file name on import. |
| `description` | 1–500 chars. **The skill's interface** — see below. |
| body | Markdown, 1–20 000 chars. The instructions themselves. |
| `type` | Not in the file. Pick `rubric`, `convention`, `security` or `custom` in the editor or the import preview. |

Skills are **text only**. Nothing in a skill is executed: an imported archive keeps only its
`SKILL.md`, and every other file (scripts, binaries, anything under `scripts/` or `bin/`) is
listed as ignored in the preview and never unpacked or run.

### The description is a directive

The model reads the description first, right under the skill heading, and uses it to decide
whether the skill applies to this diff. Write it as an instruction, not a summary:

- **When to apply it** — the kind of change that triggers the skill.
- **What to flag** — the concrete problem, and the default severity if there is one.

| Weak (summary) | Strong (directive) |
|---|---|
| "Guidelines about test coverage." | "Apply when a diff adds branches or guards. Flag each new branch, error path or boundary the changed tests do not exercise; happy-path-only tests are a WARNING." |
| "API versioning best practices." | "Apply when a diff changes a public route. Flag any breaking contract change that ships without a new version or route as CRITICAL." |

### Body conventions

Follow the [agent prompt conventions](../agent-prompts/README.md):

- Severity uses the schema vocabulary only: `CRITICAL | WARNING | SUGGESTION`. No other scale.
- Do **not** describe the JSON output shape, field names or a markdown layout — the schema is
  enforced out of band.
- Say what to flag and why, with a short bad/good example. Say what **not** to flag, so the
  skill doesn't pad the findings list.
- Speculative issues ("might", "if not handled elsewhere") are at most `WARNING`.

## Skills in this folder

| Skill | File | Suggested type | Agent |
|---|---|---|---|
| test-branch-coverage | [test-branch-coverage.md](test-branch-coverage.md) | rubric | Test Quality Reviewer |
| test-mocking-discipline | [test-mocking-discipline.md](test-mocking-discipline.md) | convention | Test Quality Reviewer |
| test-flakiness | [test-flakiness.md](test-flakiness.md) | rubric | Test Quality Reviewer |
| api-route-breaking-change | [api-route-breaking-change.md](api-route-breaking-change.md) | rubric | API Contract Reviewer |
| api-versioning-gate | [api-versioning-gate/](api-versioning-gate/SKILL.md) | convention | API Contract Reviewer (import demo) |
| breaking-change | [breaking-change.md](breaking-change.md) | rubric | API Contract Reviewer |
| response-schema | [response-schema.md](response-schema.md) | rubric | API Contract Reviewer |
| semver-discipline | [semver-discipline.md](semver-discipline.md) | convention | API Contract Reviewer |

Both agents are seeded with **no** skills. Link them in the agent's **Skills** tab, in the
order above. The control experiment in [experiments/](experiments/README.md) shows each agent
missing an issue without its skills and flagging it with them.

## Importing

- **`.md`** — upload a single skill file (e.g. `test-flakiness.md`). Frontmatter gives the name
  and description; the rest is the body.
- **`.zip`** — Agent-Skill layout: a folder with `SKILL.md` plus any other files. The
  shallowest `SKILL.md` becomes the skill; everything else is shown as ignored.

`api-versioning-gate/` is the zip demo. It ships `scripts/check.sh` on purpose, so the import
preview shows that executables are ignored. Build the archive:

```bash
cd docs/skills && zip -r api-versioning-gate.zip api-versioning-gate
```

Import `docs/skills/api-versioning-gate.zip`, check that the preview lists `scripts/check.sh`
(and `reference.md`) as ignored, then confirm. Don't commit the `.zip`.
