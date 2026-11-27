---
name: test-branch-coverage
description: Apply when a diff adds or changes branching logic (if/else, switch, guards, early returns, throws, catch blocks, ternaries, limits). Flag each new branch, error path or boundary value (0, empty, max, off-by-one) that the tests changed in the same diff do not exercise. A test that covers only the happy path of new branching code is a WARNING.
---

# Test branch coverage

Goal: every behaviour the diff **adds** is pinned by a test the diff **adds or changes**. You are
not measuring line coverage; you are checking that each new decision point has a test that takes
each of its sides.

## How to check

1. In the production files of the diff, list every new or changed decision point:
   - `if` / `else if` / `else`, `switch` cases and `default`, ternaries, `&&` / `??` short-circuits
     that change the result.
   - Guards and early returns (`if (!x) return`, `if (qty <= 0) throw …`).
   - Error paths: `throw`, `catch`, rejected promises, error status codes, fallback values.
   - Boundaries in comparisons: `>=` vs `>`, `< length`, limits, thresholds, pagination edges.
2. In the test files of the diff, find the test(s) for that code. For each decision point ask:
   is there an input that takes **this** side, and an assertion on what that side does?
3. For each comparison, check the boundary values: the threshold itself, one below and one
   above (e.g. `quantity >= 10` → 9, 10, 11), plus `0`, empty (`''`, `[]`, `{}`), `null` /
   `undefined` where the type allows it, and the maximum if one is defined.

## What to flag

| Situation | Severity |
|---|---|
| New code has branches or guards, and the changed tests cover only the happy path | WARNING |
| A new guard / validation / `throw` has no test that triggers it | WARNING |
| A new threshold or limit is tested on one side only, or never at the exact boundary | WARNING |
| A new error path decides money, auth, data deletion or persistence, and is untested | WARNING (CRITICAL only if the diff shows the branch is already wrong and a test would have caught it) |
| A missing edge case that is plausible but not introduced by this diff | SUGGESTION |

Cite the line of the **untested branch** in the production file, not the test file, and name
the missing input in the finding (e.g. "no test with `quantity = 10`, the first discounted
value"). That makes the fix obvious and keeps the citation inside the diff.

## Example

```ts
// src/discount.ts (added)
export function discount(price: number, quantity: number): number {
  if (price < 0 || quantity <= 0) throw new RangeError('invalid input'); // guard
  if (quantity >= 10) return price * quantity * 0.9;                      // boundary
  return price * quantity;
}

// src/discount.test.ts (added)
it('computes the total', () => {
  expect(discount(5, 2)).toBe(10);
});
```

Findings: the guard on the `throw` line has no test (negative price, `quantity = 0`) → WARNING;
the `quantity >= 10` branch is never taken and the boundary 9 / 10 is untested → WARNING.

A good test set adds `discount(-1, 1)` and `discount(5, 0)` → throws, `discount(5, 9)` → 45,
`discount(5, 10)` → 45 (10 × 5 × 0.9).

## Do not flag

- Branches that the diff did not add or change.
- Trivial code with no decision point (getters, re-exports, pure wiring, type-only changes).
- Branches already covered by an existing test you can see in the diff context.
- A missing test when the diff changes no test files **and** the agent prompt already covers
  "no tests added" — report that once, not once per branch.
- One finding per decision point at most; don't list every possible input as its own finding.
