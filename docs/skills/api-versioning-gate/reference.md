# api-versioning-gate — reference (for humans)

Not part of the skill. On import only `SKILL.md` becomes the skill; this file is listed as
ignored in the preview, like `scripts/check.sh`. Everything the model needs must be in
`SKILL.md`.

## Why this skill is a zip

It is the import demo for the Agent-Skill layout (`SKILL.md` + other files). Build and import:

```bash
cd docs/skills && zip -r api-versioning-gate.zip api-versioning-gate
```

Expected preview: name `api-versioning-gate`, the description from the frontmatter, and two
ignored files — `scripts/check.sh` (executable / under `scripts/`) and `reference.md` (not the
skill file).

## Headers mentioned in the skill

- `Deprecation` — RFC 9745, marks a resource as deprecated.
- `Sunset` — RFC 8594, the date after which the resource may stop responding.
- `Link: <…>; rel="successor-version"` — RFC 5829 link relation pointing to the new version.
