# Skills control experiment

Shows that a skill changes what an agent finds. Each experiment reviews the same PR twice with
the same agent: once with **no skills** (expected: the issue is missed) and once with the
agent's skills linked and enabled (expected: the issue is flagged). The run trace shows exactly
what was added to the prompt.

| Patch | What it does | Agent | Skills |
|---|---|---|---|
| [`base.patch`](base.patch) | Demo project: Fastify `GET /users/:id` + Vitest setup. Goes on `main`. | — | — |
| [`test-quality-happy-path.patch`](test-quality-happy-path.patch) | Adds `src/discount.ts` (input guards, bulk discount at `quantity >= 10`) and a test that covers only the happy path | Test Quality Reviewer | test-branch-coverage, test-mocking-discipline, test-flakiness |
| [`api-contract-route-signature.patch`](api-contract-route-signature.patch) | Changes `GET /users/:id` → `GET /users/:userId` and renames the response field `name` → `fullName`, in place, with no versioning | API Contract Reviewer | api-route-breaking-change, api-versioning-gate |

`test-quality-happy-path.patch` only adds files and applies to any repo.
`api-contract-route-signature.patch` modifies `src/routes/users.ts`, so it needs `base.patch`
on `main` first — otherwise the PR would show a new file, not a contract change.

Commands below run from the demo repo; `$DD` is your DevDigest checkout.

```bash
export DD=/path/to/dev-digest
```

## 1. Demo repo

Create an **empty** GitHub repo (private is fine, no README / license), e.g.
`devdigest-skills-demo`, then clone it and put the base project on `main`:

```bash
git clone git@github.com:<you>/devdigest-skills-demo.git && cd devdigest-skills-demo
```

```bash
git am "$DD/docs/skills/experiments/base.patch"
```

```bash
git push -u origin HEAD:main
```

`git am` keeps the commit message from the patch. `git apply <patch> && git add -A && git commit`
works too.

## 2. Open the two PRs

Test quality PR:

```bash
git switch -c demo/test-quality main
```

```bash
git am "$DD/docs/skills/experiments/test-quality-happy-path.patch"
```

```bash
git push -u origin demo/test-quality
```

```bash
gh pr create --base main --head demo/test-quality --title "feat: order total with bulk discount" --body "Adds order total with a bulk discount."
```

API contract PR:

```bash
git switch -c demo/api-contract main
```

```bash
git am "$DD/docs/skills/experiments/api-contract-route-signature.patch"
```

```bash
git push -u origin demo/api-contract
```

```bash
gh pr create --base main --head demo/api-contract --title "refactor(users): clearer param and field names" --body "Renames for readability."
```

The PR texts are neutral on purpose: nothing hints at tests or breaking changes, so the result
depends on the agent's prompt and skills only.

## 3. Import the PRs into DevDigest

Start the stack (`./scripts/dev.sh` from the DevDigest root), open the studio at
<http://localhost:3000>, add the demo repo and import both PRs.

## 4. Run without skills (control)

Open the agent's **Skills** tab and make sure no skill is linked or enabled — the two seeded
agents start with none.

| PR | Agent | Expected without skills |
|---|---|---|
| demo/test-quality | Test Quality Reviewer | Misses that the two `RangeError` guards (`src/discount.ts:9`, `:12`) and the `quantity >= 10` branch (`:17`) are never tested; at most a generic remark |
| demo/api-contract | API Contract Reviewer | Treats the change as a rename / refactor; no CRITICAL for the removed `name` response field |

Write down the findings (severity, file:line) and the score of each run.

## 5. Add the skills

Create the skills from `docs/skills/` (Skills page → import):

- `.md` files: import `test-branch-coverage.md`, `test-mocking-discipline.md`,
  `test-flakiness.md`, `api-route-breaking-change.md` one by one.
- Zip demo: build the archive and import it.

  ```bash
  cd "$DD/docs/skills" && zip -r api-versioning-gate.zip api-versioning-gate
  ```

  The preview must list `scripts/check.sh` and `reference.md` as **ignored**: only `SKILL.md`
  becomes the skill, nothing is unpacked or run. Confirm the import. Delete the `.zip`
  afterwards; don't commit it.

Then, in each agent's **Skills** tab, link and enable the skills in this order:

- Test Quality Reviewer: test-branch-coverage → test-mocking-discipline → test-flakiness
- API Contract Reviewer: api-route-breaking-change → api-versioning-gate

## 6. Rerun with skills

Run the same agent on the same PR again.

| PR | Expected with skills |
|---|---|
| demo/test-quality | WARNING: guards on `src/discount.ts:9` / `:12` have no test (negative price, `quantity = 0`, non-integer); WARNING: bulk branch `:17` untested, boundary 9 / 10 missing — happy-path-only test |
| demo/api-contract | CRITICAL: response field `name` → `fullName` (`src/routes/users.ts:30`, `:44`) breaks clients; CRITICAL (versioning gate): contract changed in place with no `/v2` route; WARNING: path param `:id` → `:userId` (`:16`) changes the published contract |

Exact wording and line choice vary by model; the point is that the issue is now flagged at the
skill's severity, citing lines inside the diff.

## 7. Check the prompt in the run trace

Open the run → **Run trace** → **Prompt assembly**:

- The system message has a `## Skills (apply in order)` block with `### Skill 1: <name>`, the
  skill's description and body, in link order — between the agent prompt and the injection
  guard. The control run has no such block.
- Each skill block shows its own **token count**; their sum is the prompt cost the skills add.
- The run log has `Skills attached: N (names)`.

Disable one link (or the skill globally) and rerun: that skill disappears from the block.

## Results

| PR | Agent | Without skills | With skills | Skill tokens |
|---|---|---|---|---|
| demo/test-quality | Test Quality Reviewer | | | |
| demo/api-contract | API Contract Reviewer | | | |
