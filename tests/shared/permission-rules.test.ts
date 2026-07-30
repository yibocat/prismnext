import { describe, expect, it } from "vitest";
import {
  buildPermissionRulesConfig,
  formatAllowRulesText,
  matchDenyRules,
  parseAllowedPathsLines,
  parsePermissionRuleLine,
  parsePermissionRuleLines,
  permissionRuleMatches,
  splitAllowRulesText,
} from "../../src/shared/permission-rules";
import {
  explainSmartPermissionAction,
  resolveSmartPermissionAction,
} from "../../src/shared/smart-permission-policy";

const ROOT = "/Users/me/paper";

describe("permission-rules", () => {
  it("parses ToolName(pattern) lines", () => {
    const parsed = parsePermissionRuleLine("Bash(git *)", 1);
    expect(parsed).toEqual({
      toolName: "bash",
      pattern: "git *",
      raw: "Bash(git *)",
      line: 1,
    });
  });

  it("rejects invalid syntax", () => {
    const result = parsePermissionRuleLines("not valid !!!");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("matches bash allow rules", () => {
    const rule = parsePermissionRuleLine("Bash(git *)", 1)!;
    if (!rule || "error" in rule) throw new Error("expected rule");
    expect(
      permissionRuleMatches(rule, {
        toolName: "bash",
        bashCommand: "git commit -m x",
      }),
    ).toBe(true);
  });

  it("matches deny rules before smart allow", () => {
    const config = buildPermissionRulesConfig({
      permissionDenyRules: ["Bash(curl *)"],
    });
    const denied = matchDenyRules(config.denyRules, {
      toolName: "bash",
      bashCommand: "curl https://example.com",
      projectRoot: ROOT,
      bashCwd: ROOT,
    });
    expect(denied?.raw).toBe("Bash(curl *)");
    expect(
      resolveSmartPermissionAction(
        {
          toolName: "bash",
          projectRoot: ROOT,
          bashCommand: "curl https://example.com",
          bashCwd: ROOT,
        },
        config,
      ),
    ).toBe("deny");
  });

  it("user allow cannot bypass outside delete hard deny", () => {
    const config = buildPermissionRulesConfig({
      permissionAllowRules: ["Delete(*)"],
    });
    expect(
      resolveSmartPermissionAction(
        {
          toolName: "delete",
          projectRoot: ROOT,
          filePath: "/tmp/x.tex",
        },
        config,
      ),
    ).toBe("deny");
  });

  it("allowed paths relax outside-project writes", () => {
    const shared = "/Users/me/shared-data";
    const config = buildPermissionRulesConfig({
      permissionAllowedPaths: [shared],
    });
    expect(
      resolveSmartPermissionAction(
        {
          toolName: "edit",
          projectRoot: ROOT,
          filePath: `${shared}/note.tex`,
        },
        config,
      ),
    ).toBe("allow");
  });

  it("merges legacy always lists into allow display text", () => {
    const text = formatAllowRulesText(
      buildPermissionRulesConfig({
        bashAllowAlwaysPatterns: ["git status*"],
        toolAllowAlways: ["delete"],
      }),
    );
    expect(text).toContain("Bash(git status*)");
    expect(text).toContain("Delete(*)");
  });

  it("splitAllowRulesText separates bash patterns and tool names", () => {
    const split = splitAllowRulesText("Bash(git *)\nDelete(*)\nEdit(drafts/*)");
    expect(split.bashAllowAlwaysPatterns).toContain("git *");
    expect(split.toolAllowAlways).toContain("delete");
    expect(split.permissionAllowRules).toContain("Edit(drafts/*)");
  });

  it("requires absolute paths", () => {
    const parsed = parseAllowedPathsLines("relative/path");
    expect(parsed.errors.length).toBe(1);
    expect(parsed.paths).toEqual([]);
  });

  it("explainSmartPermissionAction reports source", () => {
    const detail = explainSmartPermissionAction(
      {
        toolName: "bash",
        projectRoot: ROOT,
        bashCommand: "git status",
        bashCwd: ROOT,
      },
      buildPermissionRulesConfig({}),
    );
    expect(detail.action).toBe("allow");
    expect(detail.source).toContain("smart_default");
  });

  it("buildPermissionRulesConfig returns cached config for identical input references", () => {
    const allowRules = ["Bash(git *)"];
    const input = {
      permissionAllowRules: allowRules,
      bashAllowAlwaysPatterns: ["git status*"],
    };
    const first = buildPermissionRulesConfig(input);
    const second = buildPermissionRulesConfig(input);
    expect(second).toBe(first);
  });

  it("buildPermissionRulesConfig recomputes when an input array reference changes", () => {
    const first = buildPermissionRulesConfig({
      permissionAllowRules: ["Bash(git *)"],
    });
    const second = buildPermissionRulesConfig({
      permissionAllowRules: ["Bash(pnpm *)"],
    });
    expect(second).not.toBe(first);
    expect(second.allowRules[0]?.raw).toBe("Bash(pnpm *)");
    const third = buildPermissionRulesConfig({
      permissionAllowRules: ["Bash(git *)"],
    });
    expect(third.allowRules[0]?.raw).toBe("Bash(git *)");
  });
});
