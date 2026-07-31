import { describe, expect, it } from "vitest";
import {
  buildEnabledToolsConfig,
  ensureSubagentModelConfig,
} from "../../src/main/services/opencode-tools-config";

describe("buildEnabledToolsConfig", () => {
  it("force-enables prismnext custom tools even when missing from existing config", () => {
    const merged = buildEnabledToolsConfig({
      read: true,
      edit: true,
      bash: false,
    });
    expect(merged.delete).toBe(true);
    expect(merged.move).toBe(true);
    expect(merged.question).toBe(true);
  });

  it("applies overrides after force-enable (e.g. bash terminal mode)", () => {
    const merged = buildEnabledToolsConfig({ bash: true }, { bash: false });
    expect(merged.bash).toBe(false);
    expect(merged.delete).toBe(true);
  });
});

describe("ensureSubagentModelConfig", () => {
  it("pins open built-in Task subagents to the global model and denies nested Task", () => {
    const next = ensureSubagentModelConfig({}, "openai/gpt-4o-mini");
    const agent = next.agent as Record<string, { model?: string; permission?: { task?: Record<string, string> } }>;
    expect(agent.general?.model).toBe("openai/gpt-4o-mini");
    expect(agent.explore?.model).toBe("openai/gpt-4o-mini");
    expect(agent.command?.model).toBe("openai/gpt-4o-mini");
    expect(agent.scout?.model).toBe("openai/gpt-4o-mini");
    expect(agent.explore?.permission?.task).toEqual({ "*": "deny" });
    expect(agent.general?.permission?.task).toEqual({ "*": "deny" });
    expect(agent.plan).toBeUndefined();
    expect(agent.build).toBeUndefined();
  });

  it("preserves other agent fields when setting model", () => {
    const next = ensureSubagentModelConfig(
      {
        agent: {
          explore: { description: "Explore", mode: "subagent" },
          plan: { permission: { edit: "deny" } },
        },
      },
      "anthropic/claude-haiku-4-20250514",
    );
    const agent = next.agent as Record<string, Record<string, unknown>>;
    expect(agent.explore).toEqual({
      description: "Explore",
      mode: "subagent",
      model: "anthropic/claude-haiku-4-20250514",
      permission: { task: { "*": "deny" } },
    });
    expect(agent.plan).toEqual({ permission: { edit: "deny" } });
  });

  it("keeps nested Task deny when model is cleared", () => {
    const next = ensureSubagentModelConfig(
      {
        agent: {
          general: { model: "openai/gpt-4o-mini", mode: "subagent" },
          explore: { model: "openai/gpt-4o-mini" },
        },
      },
      null,
    );
    const agent = next.agent as Record<string, Record<string, unknown> | undefined>;
    expect(agent.general).toEqual({
      mode: "subagent",
      permission: { task: { "*": "deny" } },
    });
    expect(agent.explore).toEqual({
      permission: { task: { "*": "deny" } },
    });
  });
});
