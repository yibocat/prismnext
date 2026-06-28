import { describe, expect, it } from "vitest";
import {
  extractBashCommandFromInput,
  isRunnableBashCommand,
} from "../../src/main/services/bash-permission-bridge";

describe("bash permission bridge", () => {
  it("does not treat generic shell titles as runnable commands", () => {
    expect(isRunnableBashCommand("bash")).toBe(false);
    expect(isRunnableBashCommand("shell")).toBe(false);
    expect(isRunnableBashCommand("terminal")).toBe(false);
    expect(isRunnableBashCommand("execute")).toBe(false);
    expect(isRunnableBashCommand("")).toBe(false);
    expect(isRunnableBashCommand("   ")).toBe(false);
  });

  it("accepts real shell commands from raw input", () => {
    expect(extractBashCommandFromInput({ command: "rm note/rl-notes.md" }))
      .toBe("rm note/rl-notes.md");
    expect(isRunnableBashCommand("rm note/rl-notes.md")).toBe(true);
  });

  it("treats destructive shell operations as runnable (they go through permission gate)", () => {
    expect(isRunnableBashCommand("rm -rf build")).toBe(true);
    expect(isRunnableBashCommand("mv a.tex b.tex")).toBe(true);
    expect(isRunnableBashCommand("chmod +x script.sh")).toBe(true);
    expect(isRunnableBashCommand("git checkout main")).toBe(true);
  });

  it("extracts command from cmd alias and _title fallback", () => {
    expect(extractBashCommandFromInput({ cmd: "echo hi" })).toBe("echo hi");
    expect(extractBashCommandFromInput({ _title: "ls -la" })).toBe("ls -la");
    expect(extractBashCommandFromInput({ title: "pwd" })).toBe("pwd");
    expect(extractBashCommandFromInput(undefined)).toBe("");
  });
});
