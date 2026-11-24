---
name: test-mocking-discipline
description: Apply when a diff adds or changes tests that use mocks, spies or stubs (vi.mock, vi.fn, vi.spyOn, jest.mock, sinon, fake adapters). Flag over-mocking - mocking the unit under test, asserting on mock calls instead of observable behaviour, and mocking pure in-process code - because such tests pass while the real code is broken.
---

# Test mocking discipline

A mock replaces a **collaborator at a boundary** (network, database, clock, file system, a
third-party SDK) so the test stays fast and deterministic. Everything else should run for real.
Flag tests in the diff where mocking makes the test unable to fail for the bug it claims to
guard.

## What to flag

| Pattern | Why it is wrong | Severity |
|---|---|---|
| The unit under test is mocked (the module or function the test file is named after, or the method being "tested", is replaced by `vi.mock` / `vi.spyOn(...).mockReturnValue`) | The test exercises the mock, not the code; it passes whatever the implementation does | WARNING |
| The only assertions are on mock calls (`toHaveBeenCalled`, `toHaveBeenCalledWith`) while the unit returns a value or changes state that is never asserted | Pins implementation details, not behaviour; a refactor breaks it, a real bug doesn't | WARNING |
| Pure in-process code is mocked (formatters, validators, mappers, Zod schemas, math, small helpers with no I/O) | The real function is cheap and deterministic; mocking it hides integration bugs between the units | WARNING |
| A mock's return value is the expected value of the assertion (`mock.mockReturnValue(42)` … `expect(result).toBe(42)` with no logic in between) | Tautology — the test asserts what it set up | WARNING |
| Mocked data has a shape the real collaborator never returns (missing required fields, wrong types, `as any` / `as unknown as T` to force it) | The test proves nothing about real inputs | SUGGESTION, WARNING if the missing field is used by the code under test |
| Module-level `vi.mock` in a shared file / no reset between tests (`mockReset`, `restoreAllMocks`, `vi.clearAllMocks` absent while mocks keep state) | Tests leak into each other; order-dependent results | SUGGESTION |

## Acceptable — do not flag

- Mocking real boundaries: HTTP clients, GitHub / LLM adapters, the DB in a unit test, the
  clock (`vi.useFakeTimers`), randomness, the file system, environment variables.
- Using a project's own test doubles for ports (e.g. hermetic adapters from a `mocks.ts`)
  instead of real infrastructure.
- Asserting a call **when the call is the behaviour**: "sends exactly one email", "does not call
  the LLM when the cache hits", "passes the auth token to the client".
- Spies that observe without replacing (`vi.spyOn(obj, 'fn')` with no `mock*` implementation)
  combined with assertions on the result.

## Example

```ts
// bad: the function under test is mocked, the assertion checks the mock
vi.mock('./pricing', () => ({ total: vi.fn(() => 90) }));
import { total } from './pricing';

it('applies the bulk discount', () => {
  expect(total(10, 10)).toBe(90);   // passes even if pricing.ts is deleted
});

// good: the real unit runs; only the boundary (tax API) is faked
const taxApi = { rate: vi.fn(async () => 0) };
it('applies the bulk discount', async () => {
  expect(await total(10, 10, taxApi)).toBe(90);
});
```

Cite the line of the `vi.mock` / `mockReturnValue` that replaces the unit, or the assertion that
checks only the mock. One finding per test file per pattern; don't repeat it for each `it`.
