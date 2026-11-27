---
name: test-flakiness
description: Apply when a diff adds or changes tests. Flag sources of non-determinism that make a test pass or fail depending on when, where or in what order it runs - real time and dates, unseeded randomness, test order and shared state, real network or external services, and fixed sleeps or timeouts used instead of awaiting a condition.
---

# Test flakiness

A flaky test fails sometimes without a code change. It wastes CI time, and people learn to
ignore red builds. Flag the cause on the test line that introduces it, and say what makes the
result vary.

## What to flag

### Time and dates
- `Date.now()`, `new Date()`, `performance.now()` in the code under test or in assertions, with
  no fake timers or injected clock (`vi.useFakeTimers()` + `vi.setSystemTime`, a `now` param).
- Assertions that depend on the current day, month, year, time zone or DST (`toISOString()`
  compared to a hard-coded local date, "expires tomorrow", `getHours()`).
- Comparing timestamps with exact equality after real work (`expect(end - start).toBe(100)`).

### Randomness
- `Math.random()`, `crypto.randomUUID()`, `faker` without a fixed seed, when the assertion
  depends on the value or on its order.
- Property-style tests with no seed logged or fixed, so a failure cannot be reproduced.

### Order and shared state
- A test that relies on state left by an earlier test (module-level variables, a shared DB row,
  a singleton cache, a `let` assigned in another `it`).
- Missing reset of mocks, timers, env vars or globals between tests (`afterEach` absent while
  the test mutates them).
- Assertions on the order of results that the code does not guarantee (DB rows without
  `ORDER BY`, `Promise.all` side effects, object key order from external data, `Set` from
  concurrent pushes).
- `.only` left in, or tests that pass only when run alone.

### Network and external services
- Real HTTP calls, real third-party APIs, DNS, or a real database / container in a test that is
  meant to be a unit test.
- Ports hard-coded where tests can run in parallel (`listen(3000)` instead of port `0`).

### Sleeps and timeouts
- `await sleep(…)`, `setTimeout` promises, `waitForTimeout(…)` used to "let things settle"
  before an assertion. Prefer awaiting the condition (`await vi.waitFor(…)`,
  `findBy…` queries, an event, the returned promise).
- Tight timeouts that a slow CI machine can miss.

## Severity

| Situation | Severity |
|---|---|
| The assertion's outcome visibly depends on time, randomness, order or the network (it **will** fail on some runs, e.g. around midnight, in another time zone, or when tests are shuffled) | WARNING |
| A fixed sleep / timeout used for synchronisation | WARNING |
| Non-determinism present but the assertion does not depend on it yet (e.g. random id generated but not asserted) | SUGGESTION |
| Missing cleanup that only matters if more tests are added | SUGGESTION |

Flaky tests never block on their own: do not use CRITICAL for flakiness.

## Example

```ts
// bad: depends on wall-clock time and a fixed sleep
it('expires the session', async () => {
  const s = createSession({ ttlMs: 50 });
  await new Promise((r) => setTimeout(r, 60));
  expect(s.isExpired()).toBe(true);
});

// good: controlled clock, no sleep
it('expires the session', () => {
  vi.useFakeTimers();
  const s = createSession({ ttlMs: 50 });
  vi.advanceTimersByTime(51);
  expect(s.isExpired()).toBe(true);
  vi.useRealTimers();
});
```

## Do not flag

- Integration / e2e suites that are meant to hit real infrastructure (e.g. `*.it.test.ts`
  against a test container), unless they also sleep or depend on order.
- Time or randomness that is already faked, seeded or injected in the same file.
- Production code using `Date.now()` — that is only a test problem when a test asserts on it.
