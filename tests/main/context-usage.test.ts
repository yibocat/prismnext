import { describe, expect, it } from "vitest";
import { estimateContextBreakdown, snapshotPiSessionUsage } from "../../src/main/agent/context-usage";

describe("estimateContextBreakdown", () => {
  it("splits skills, rules, subagents, tools, and MCP out of the system prompt", () => {
    const breakdown = estimateContextBreakdown({
      systemPrompt: [
        "You are PrismNext.",
        "## Available subagents (via Task)",
        "- `writer` — drafts sections.",
        "<project_context>",
        "<project_instructions path=\"AGENTS.md\">Use the house style.</project_instructions>",
        "</project_context>",
        "The following skills provide specialized instructions for specific tasks.",
        "<available_skills>",
        "  <skill><name>cite</name><description>Cite papers</description></skill>",
        "</available_skills>",
      ].join("\n"),
      getAllTools: () => [
        { name: "read", description: "Read a file", parameters: { type: "object" } },
        { name: "mcp__exa__search", description: "Web search", parameters: { type: "object" } },
      ],
    }, 5000);

    expect(breakdown.systemPrompt).toBeGreaterThan(0);
    expect(breakdown.subagents).toBeGreaterThan(0);
    expect(breakdown.rules).toBeGreaterThan(0);
    expect(breakdown.skills).toBeGreaterThan(0);
    expect(breakdown.tools).toBeGreaterThan(0);
    expect(breakdown.mcp).toBeGreaterThan(0);
    expect(breakdown.conversation).toBeGreaterThan(0);
    const staticSum = (breakdown.systemPrompt ?? 0)
      + (breakdown.subagents ?? 0)
      + (breakdown.rules ?? 0)
      + (breakdown.skills ?? 0)
      + (breakdown.tools ?? 0)
      + (breakdown.mcp ?? 0);
    expect(staticSum + (breakdown.conversation ?? 0)).toBe(5000);
  });
});

describe("snapshotPiSessionUsage", () => {
  it("reads getSessionStats for cumulative spend and getContextUsage for occupancy", () => {
    const snap = snapshotPiSessionUsage({
      getSessionStats: () => ({
        tokens: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0 },
        cost: 0.04,
      }),
      getContextUsage: () => ({ tokens: 11_600, contextWindow: 1_000_000, percent: 1 }),
    });
    expect(snap?.costUsd).toBe(0.04);
    expect(snap?.occupancyTokens).toBe(11_600);
    expect(snap?.windowSize).toBe(1_000_000);
  });

  it("falls back to catalog $/M when billed cost is 0", () => {
    const snap = snapshotPiSessionUsage({
      getSessionStats: () => ({
        tokens: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
        cost: 0,
      }),
      model: { cost: { input: 0.15, output: 0.6 } },
    });
    expect(snap?.costUsd).toBeCloseTo(0.15);
  });

  it("keeps previous spend across a model switch when billed cost is 0", () => {
    const snap = snapshotPiSessionUsage({
      getSessionStats: () => ({
        tokens: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
        cost: 0,
      }),
      model: { cost: { input: 0.15, output: 0.6 } },
    }, { previousCostUsd: 1.23 });
    expect(snap?.costUsd).toBe(1.23);
  });

  it("still accepts getStats fakes used by tests", () => {
    const snap = snapshotPiSessionUsage({
      getStats: () => ({
        tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
        cost: 0.01,
      }),
    });
    expect(snap?.costUsd).toBe(0.01);
  });
});
