import { describe, expect, it } from "vitest";
import {
  isValidRuleName,
  resolveProjectRuleWrite,
  buildProjectRuleMarkdown,
} from "../../src/shared/workbench/project-rule-md";

describe("project-rule-md", () => {
  it("rejects invalid names", () => {
    expect(isValidRuleName("OK")).toBe(false);
    expect(isValidRuleName("cite-style")).toBe(true);
  });

  it("creates RULE.md for missing rule", () => {
    const r = resolveProjectRuleWrite({
      existingContent: null,
      name: "cite-style",
      description: "Citation format",
      body: "Always use \\cite{}.",
      mode: "create",
      apply: "always",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mode).toBe("create");
    expect(r.content).toContain("name: cite-style");
    expect(r.content).toContain("Always use \\cite{}.");
  });

  it("appends body when mode is append", () => {
    const existing = buildProjectRuleMarkdown({
      name: "cite-style",
      description: "Citation format",
      apply: "always",
      enabled: true,
      body: "Use \\cite{}.",
    });
    const r = resolveProjectRuleWrite({
      existingContent: existing,
      name: "cite-style",
      description: "Citation format",
      body: "Never invent bibkeys.",
      mode: "append",
      apply: "always",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content).toContain("Use \\cite{}.");
    expect(r.content).toContain("Never invent bibkeys.");
  });

  it("rejects non-always apply", () => {
    const r = resolveProjectRuleWrite({
      existingContent: null,
      name: "x",
      description: "d",
      body: "b",
      mode: "create",
      apply: "glob",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects create when rule already exists", () => {
    const existing = buildProjectRuleMarkdown({
      name: "cite-style",
      description: "Citation format",
      apply: "always",
      enabled: true,
      body: "Use \\cite{}.",
    });
    const r = resolveProjectRuleWrite({
      existingContent: existing,
      name: "cite-style",
      description: "Citation format",
      body: "More.",
      mode: "create",
      apply: "always",
    });
    expect(r.ok).toBe(false);
  });
});
