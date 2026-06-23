import { describe, expect, it } from "vitest";
import {
  resolveTerminalRoot,
  terminalTabTitleFromCwd,
  terminalTabLabelFromCommand,
  isTerminalCommandBusy,
} from "../../src/renderer/lib/terminal/root";

describe("terminal-root", () => {
  it("prefers checkoutRoot over projectRoot", () => {
    expect(resolveTerminalRoot("/proj/.prismnext/worktrees/owl", "/proj")).toBe(
      "/proj/.prismnext/worktrees/owl",
    );
  });

  it("falls back to projectRoot when checkoutRoot is empty", () => {
    expect(resolveTerminalRoot("", "/proj")).toBe("/proj");
    expect(resolveTerminalRoot(null, "/proj")).toBe("/proj");
  });

  it("returns null when no roots are available", () => {
    expect(resolveTerminalRoot(null, null)).toBeNull();
  });

  it("derives tab title from cwd basename", () => {
    expect(terminalTabTitleFromCwd("/Users/me/proj/chapter1")).toBe("chapter1");
    expect(terminalTabTitleFromCwd("C:\\proj\\main")).toBe("main");
  });

  it("derives tab label from submitted command", () => {
    expect(terminalTabLabelFromCommand("pnpm test")).toBe("pnpm test");
    expect(terminalTabLabelFromCommand("")).toBe("Shell");
    expect(terminalTabLabelFromCommand("a".repeat(60)).endsWith("…")).toBe(true);
  });

  it("treats starting and running sessions as active", () => {
    expect(isTerminalCommandBusy(true)).toBe(true);
    expect(isTerminalCommandBusy(false)).toBe(false);
    expect(isTerminalCommandBusy(undefined)).toBe(false);
  });
});
