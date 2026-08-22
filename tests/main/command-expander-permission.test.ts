import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/main/app/settings", () => ({
  getSettings: () => ({
    permissionMode: "edit_auto",
    permissionAllowedPaths: [],
    permissionAllowRules: [],
    permissionDenyRules: [],
    bashAllowAlwaysPatterns: [],
    toolAllowAlways: [],
  }),
}));

import {
  expandTemplate,
  resolveCommandShellExpansionAction,
} from "../../src/main/commands/expander";

const ROOT = "/Users/me/paper";

describe("command expander permission", () => {
  it("allows in-project git status shell expansion", () => {
    expect(resolveCommandShellExpansionAction("git status", ROOT)).toBe("allow");
  });

  it("denies dangerous shell expansion", () => {
    expect(resolveCommandShellExpansionAction("sudo rm -rf /", ROOT)).toBe("deny");
  });

  it("returns permission error placeholder instead of executing denied shell", () => {
    const out = expandTemplate("!`sudo ls`", {
      name: "test",
      args: { ARGUMENTS: "" },
      files: [],
      shells: ["sudo ls"],
    }, ROOT);
    expect(out).toContain("[Error: permission denied");
    expect(out).not.toContain("root");
  });

  it("allows echo via policy check", () => {
    expect(resolveCommandShellExpansionAction("echo hi", ROOT)).toBe("allow");
  });
});
