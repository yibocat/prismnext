import { describe, expect, it } from "vitest";
import {
  buildRuleMd,
  isValidRuleName,
  parseRuleMd,
} from "../../src/renderer/lib/agent/rule-config";
import {
  defaultNewRuleMarkdown,
  validateRuleMarkdown,
} from "../../src/renderer/lib/agent/rules-markdown";

describe("rule-config", () => {
  it("round-trips RULE.md", () => {
    const md = buildRuleMd({
      name: "latex-style",
      description: "LaTeX constraints",
      apply: "always",
      enabled: true,
      body: "# Style\n\nUse \\cite{}.",
    });
    const parsed = parseRuleMd(md);
    expect(parsed.name).toBe("latex-style");
    expect(parsed.description).toBe("LaTeX constraints");
    expect(parsed.apply).toBe("always");
    expect(parsed.enabled).toBe(true);
    expect(parsed.body).toContain("\\cite");
  });

  it("validates rule names", () => {
    expect(isValidRuleName("latex-style")).toBe(true);
    expect(isValidRuleName("Bad_Name")).toBe(false);
  });

  it("defaults apply to always and enabled to true", () => {
    const parsed = parseRuleMd(`---
name: x
description: y
---
Body`);
    expect(parsed.apply).toBe("always");
    expect(parsed.enabled).toBe(true);
  });

  it("parses enabled: false", () => {
    const parsed = parseRuleMd(`---
name: x
description: y
enabled: false
---
Body`);
    expect(parsed.enabled).toBe(false);
  });
});

describe("rules-markdown", () => {
  it("defaultNewRuleMarkdown includes apply always", () => {
    const md = defaultNewRuleMarkdown();
    expect(md).toContain("apply: always");
    expect(md).toContain("enabled: true");
  });

  it("validateRuleMarkdown rejects empty content", () => {
    expect(validateRuleMarkdown("").ok).toBe(false);
  });

  it("validateRuleMarkdown requires name to match folder id when editing", () => {
    const md = buildRuleMd({
      name: "other-name",
      description: "desc",
      apply: "always",
      enabled: true,
      body: "Body",
    });
    const result = validateRuleMarkdown(md, "latex-style");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("latex-style");
    }
  });
});
