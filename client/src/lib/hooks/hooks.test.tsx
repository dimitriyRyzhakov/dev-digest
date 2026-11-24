/**
 * Data-layer hooks: query keys stay stable (other code and the cache depend on
 * the exact arrays), refreshers hit the right keys, and number → uuid lookup.
 * `fetch` is mocked — no API needed.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { agentKeys, useUpdateAgent } from "./agents";
import { coreKeys, usePrIdByNumber } from "./core";
import { reviewKeys, usePrRunsRefresh } from "./reviews";
import { repoIntelKeys } from "./repo-intel";
import { traceKeys } from "./trace";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

function mockFetchJson(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("query keys — exact shapes are part of the cache contract", () => {
  it("keeps the arrays used before the key factories existed", () => {
    expect(agentKeys.list()).toEqual(["agents"]);
    expect(agentKeys.detail("a1")).toEqual(["agent", "a1"]);
    expect(agentKeys.providerModels("openai")).toEqual(["provider-models", "openai"]);
    expect(coreKeys.pulls("repo1")).toEqual(["pulls", "repo1"]);
    expect(coreKeys.pull("pr1")).toEqual(["pull", "pr1"]);
    expect(reviewKeys.list("pr1")).toEqual(["reviews", "pr1"]);
    expect(reviewKeys.activeRuns("pr1")).toEqual(["pr-active-runs", "pr1"]);
    expect(reviewKeys.runs("pr1")).toEqual(["pr-runs", "pr1"]);
    expect(repoIntelKeys.state("repo1")).toEqual(["repo-intel-state", "repo1"]);
    expect(traceKeys.run("r1")).toEqual(["run-trace", "r1"]);
  });

  it("providerModelsAll is a prefix of every per-provider key (prefix invalidation)", () => {
    const all = agentKeys.providerModelsAll();
    expect(agentKeys.providerModels("anthropic").slice(0, all.length)).toEqual([...all]);
  });
});

describe("usePrRunsRefresh", () => {
  it("invalidates only the PR's active runs / history / reviews", () => {
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => usePrRunsRefresh("pr1"), { wrapper });
    result.current.activeRuns();
    result.current.history();
    result.current.reviews();
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      ["pr-active-runs", "pr1"],
      ["pr-runs", "pr1"],
      ["reviews", "pr1"],
    ]);
  });

  it("is a no-op without a prId (PR not resolved yet)", () => {
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => usePrRunsRefresh(null), { wrapper });
    result.current.activeRuns();
    result.current.history();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("usePrIdByNumber", () => {
  it("resolves the route's PR number to the row uuid from the pulls list", async () => {
    mockFetchJson([
      { id: "uuid-7", number: 7 },
      { id: "uuid-8", number: 8 },
    ]);
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrIdByNumber("repo1", 8), { wrapper });
    await waitFor(() => expect(result.current.prId).toBe("uuid-8"));
    expect(result.current.isLoading).toBe(false);
  });

  it("returns null for a number that isn't in the list", async () => {
    mockFetchJson([{ id: "uuid-7", number: 7 }]);
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrIdByNumber("repo1", 99), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.prId).toBeNull();
  });
});

describe("useUpdateAgent", () => {
  it("writes the saved agent into its detail cache and invalidates the list", async () => {
    const saved = { id: "a1", name: "Renamed", version: 2 };
    mockFetchJson(saved);
    const { qc, wrapper } = setup();
    const inval = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateAgent(), { wrapper });
    await act(() => result.current.mutateAsync({ id: "a1", patch: { name: "Renamed" } }));
    expect(qc.getQueryData(agentKeys.detail("a1"))).toEqual(saved);
    expect(inval.mock.calls.some((c) => JSON.stringify(c[0]?.queryKey) === JSON.stringify(["agents"]))).toBe(true);
  });
});
