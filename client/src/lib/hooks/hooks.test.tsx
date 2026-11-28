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
import { reviewKeys, usePrIntent, usePrRunsRefresh, usePrSmartDiff, useRefreshOnRunsSettled } from "./reviews";
import { repoIntelKeys } from "./repo-intel";
import { traceKeys } from "./trace";
import { skillKeys, useSetAgentSkills } from "./skills";

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
    expect(skillKeys.list()).toEqual(["skills"]);
    expect(skillKeys.detail("s1")).toEqual(["skill", "s1"]);
    expect(skillKeys.agentLinks("a1")).toEqual(["agent-skills", "a1"]);
  });

  it("agentLinksAll is a prefix of every per-agent links key", () => {
    const all = skillKeys.agentLinksAll();
    expect(skillKeys.agentLinks("a1").slice(0, all.length)).toEqual([...all]);
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
    result.current.intent();
    expect(spy).not.toHaveBeenCalled();
  });

  it("M3: intent() invalidates only the PR's intent key", () => {
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => usePrRunsRefresh("pr1"), { wrapper });
    result.current.intent();
    expect(reviewKeys.intent("pr1")).toEqual(["pr-intent", "pr1"]);
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([["pr-intent", "pr1"]]);
  });
});

describe("useRefreshOnRunsSettled", () => {
  const settledKeys = [
    ["reviews", "pr1"],
    ["pr-runs", "pr1"],
    ["pr-intent", "pr1"],
    ["pr-smart-diff", "pr1"],
  ];

  it("invalidates reviews, runs, intent and smart diff when active runs go 1 → 0", async () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(reviewKeys.activeRuns("pr1"), [{ run_id: "r1", agent_id: null, agent_name: null, ran_at: null }]);
    mockFetchJson([{ run_id: "r1", agent_id: null, agent_name: null, ran_at: null }]);
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { rerender } = renderHook(() => useRefreshOnRunsSettled("pr1"), { wrapper });
    expect(spy).not.toHaveBeenCalled();
    act(() => qc.setQueryData(reviewKeys.activeRuns("pr1"), []));
    rerender();
    await waitFor(() => expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual(settledKeys));
  });

  it("does nothing when no run was active (0 → 0) or runs start (0 → 1)", () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(reviewKeys.activeRuns("pr1"), []);
    mockFetchJson([]);
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { rerender } = renderHook(() => useRefreshOnRunsSettled("pr1"), { wrapper });
    act(() => qc.setQueryData(reviewKeys.activeRuns("pr1"), [{ run_id: "r1", agent_id: null, agent_name: null, ran_at: null }]));
    rerender();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("usePrIntent", () => {
  it("GETs /pulls/:id/intent and returns the response", async () => {
    const fetchSpy = mockFetchJson({ intent: null });
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrIntent("pr1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ intent: null });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toMatch(/\/pulls\/pr1\/intent$/);
  });
});

describe("usePrSmartDiff", () => {
  it("keys on the PR and GETs /pulls/:id/smart-diff", async () => {
    expect(reviewKeys.smartDiff("pr1")).toEqual(["pr-smart-diff", "pr1"]);
    const body = { groups: [], split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] } };
    const fetchSpy = mockFetchJson(body);
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => usePrSmartDiff("pr1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(body);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toMatch(/\/pulls\/pr1\/smart-diff$/);
    expect(qc.getQueryData(["pr-smart-diff", "pr1"])).toEqual(body);
  });

  it("does not fetch without a prId", () => {
    const fetchSpy = mockFetchJson({});
    const { wrapper } = setup();
    renderHook(() => usePrSmartDiff(null), { wrapper });
    expect(fetchSpy).not.toHaveBeenCalled();
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

describe("useSetAgentSkills", () => {
  it("writes the ordered links optimistically and posts them as `links`", async () => {
    const { qc, wrapper } = setup();
    const fetchSpy = mockFetchJson([
      { agent_id: "a1", skill_id: "s2", order: 0, enabled: true },
      { agent_id: "a1", skill_id: "s1", order: 1, enabled: false },
    ]);
    const { result } = renderHook(() => useSetAgentSkills(), { wrapper });
    act(() => {
      result.current.mutate({
        agentId: "a1",
        links: [
          { skill_id: "s2", enabled: true },
          { skill_id: "s1", enabled: false },
        ],
      });
    });
    await waitFor(() =>
      expect(qc.getQueryData(skillKeys.agentLinks("a1"))).toEqual([
        { agent_id: "a1", skill_id: "s2", order: 0, enabled: true },
        { agent_id: "a1", skill_id: "s1", order: 1, enabled: false },
      ]),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toMatch(/\/agents\/a1\/skills$/);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      links: [
        { skill_id: "s2", enabled: true },
        { skill_id: "s1", enabled: false },
      ],
    });
  });
});
