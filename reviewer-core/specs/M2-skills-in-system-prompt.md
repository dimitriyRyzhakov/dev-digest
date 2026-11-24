# M2 — Skills in the system prompt (engine)

Server half: [server/specs/M2-skills.md](../../server/specs/M2-skills.md).

## Goal
Skills are instructions, not context. They move from the user message (`## Skills / rules`)
into the **system** message, after the agent's own prompt and before the injection guard, so
that the injection guard stays last.

## API change
- `PromptParts.skills` and `ReviewInput.skills` become `PromptSkill[]`, where
  `PromptSkill = { name: string; description: string; body: string }`, exported from `src/index.ts`.
- `renderSkillsBlock(skills)` (exported) returns the rendered block, or `undefined` for an empty
  list:

```
## Skills (apply in order)

### Skill 1: <name>
<description>

<body>

### Skill 2: …
```

- `renderSkillBlock(skill, index)` renders one skill. The server reuses it to count tokens per
  skill.
- The system message is `system_prompt`, then the skills block when present, then `INJECTION_GUARD`.
- The user message no longer has a skills section.
- `assembly.skills` is the rendered block, or `null`.
- Map-reduce gets the same system message for every chunk.

## Acceptance criteria
- With skills, the system message contains the block after the agent prompt and before the
  guard, in the given order.
- With no skills, or an empty list, the system message is identical to the pre-M2 one.
- The user message never contains skill text.
