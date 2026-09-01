import { describe, expect, it } from "vitest";
import { estimateContextBreakdown, snapshotPiSessionUsage } from "../../src/main/agent/context-usage";
import { formatToolGuidelinesPrompt } from "../../src/main/agent/tool-guidelines-prompt";
import {
  wrapAgentsMdProjectContext,
  wrapCapabilityModulesMarkup,
} from "../../src/shared/agent/prompt-markup";

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
      + (breakdown.modules ?? 0)
      + (breakdown.subagents ?? 0)
      + (breakdown.rules ?? 0)
      + (breakdown.skills ?? 0)
      + (breakdown.tools ?? 0)
      + (breakdown.mcp ?? 0);
    expect(staticSum + (breakdown.conversation ?? 0)).toBe(5000);
  });

  it("splits capability modules and tool how-to, and counts per-turn project rules", () => {
    const modules = wrapCapabilityModulesMarkup("## Experiments\n\nUse islands.");
    const agents = wrapAgentsMdProjectContext("Prefer local papers.");
    const guidelines = formatToolGuidelinesPrompt([
      { promptGuidelines: ["Call experiment-run after detect_env."] },
    ]);
    const breakdown = estimateContextBreakdown({
      systemPrompt: [
        "You are PrismNext.",
        agents,
        modules,
        "## Available subagents (via Task)",
        "- `writer` — drafts sections.",
        guidelines,
      ].join("\n\n"),
      projectRules: "Always cite bibkeys in replies.",
      getAllTools: () => [
        { name: "read", description: "Read a file", parameters: { type: "object" } },
      ],
    }, 8000);

    expect(breakdown.modules).toBeGreaterThan(0);
    expect(breakdown.rules).toBeGreaterThan(0);
    expect(breakdown.tools).toBeGreaterThan(0);
    expect(breakdown.systemPrompt).toBeGreaterThan(0);
    expect(breakdown.systemPrompt).toBeLessThan(breakdown.modules ?? 0);
    const withoutGuidelines = estimateContextBreakdown({
      systemPrompt: [
        "You are PrismNext.",
        agents,
        modules,
        "## Available subagents (via Task)",
        "- `writer` — drafts sections.",
      ].join("\n\n"),
      getAllTools: () => [
        { name: "read", description: "Read a file", parameters: { type: "object" } },
      ],
    }, null);
    expect(breakdown.tools ?? 0).toBeGreaterThan(withoutGuidelines.tools ?? 0);
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

  it("includes per-turn project rules in the occupancy breakdown", () => {
    const snap = snapshotPiSessionUsage({
      systemPrompt: "You are PrismNext.",
      projectRules: "Always cite bibkeys in replies.",
      getContextUsage: () => ({ tokens: 1000, contextWindow: 10_000, percent: 10 }),
    }, { includeBreakdown: true });
    expect(snap?.breakdown?.rules).toBeGreaterThan(0);
  });

  it("reads prototype getters/methods on a Pi-like session and overlays project rules without spreading", () => {
    class PiLikeSession {
      get systemPrompt() {
        return [
          "You are PrismNext.",
          "<capability_modules>",
          "## Experiments",
          "Use islands.",
          "</capability_modules>",
        ].join("\n");
      }
      get model() {
        return { contextWindow: 100_000 };
      }
      getAllTools() {
        return [{ name: "read", description: "Read a file", parameters: { type: "object" } }];
      }
      getSessionStats() {
        return {
          tokens: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0 },
          cost: 0.01,
        };
      }
      getContextUsage() {
        return { tokens: 5000, contextWindow: 100_000, percent: 5 };
      }
    }

    const session = new PiLikeSession();
    const spread = snapshotPiSessionUsage(
      { ...session },
      { includeBreakdown: true },
    );
    expect(spread?.occupancyTokens ?? null).not.toBe(5000);
    expect(spread?.breakdown?.tools ?? 0).toBe(0);

    const snap = snapshotPiSessionUsage(session, {
      includeBreakdown: true,
      projectRules: "Always cite bibkeys in replies.",
    });
    expect(snap?.occupancyTokens).toBe(5000);
    expect(snap?.windowSize).toBe(100_000);
    expect(snap?.breakdown?.tools).toBeGreaterThan(0);
    expect(snap?.breakdown?.modules).toBeGreaterThan(0);
    expect(snap?.breakdown?.rules).toBeGreaterThan(0);
    expect(snap?.breakdown?.systemPrompt).toBeGreaterThan(0);
  });

  it("omits a zero breakdown so the ring does not replace categories with an empty object", () => {
    const snap = snapshotPiSessionUsage(
      { model: { contextWindow: 128_000 } },
      { includeBreakdown: true },
    );
    expect(snap?.windowSize).toBe(128_000);
    expect(snap?.breakdown).toBeUndefined();
  });
});

describe("formatToolGuidelinesPrompt", () => {
  it("wraps unique how-to lines and skips empty tool lists", () => {
    expect(formatToolGuidelinesPrompt([])).toBe("");
    expect(formatToolGuidelinesPrompt([{ promptGuidelines: ["  "] }])).toBe("");
    const text = formatToolGuidelinesPrompt([
      { promptGuidelines: ["Call experiment-run after detect_env.", "Call experiment-run after detect_env."] },
      { promptGuidelines: ["Read the brief before planning."] },
    ]);
    expect(text).toContain("<tool_guidelines>");
    expect(text).toContain("- Call experiment-run after detect_env.");
    expect(text).toContain("- Read the brief before planning.");
    expect(text.match(/Call experiment-run after detect_env/g)).toHaveLength(1);
  });
});
