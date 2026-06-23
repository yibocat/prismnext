import { describe, expect, it } from "vitest";
import { applyTerminalInput } from "../../src/renderer/lib/terminal/input-line";

describe("terminal-input-line", () => {
  it("accumulates typed command and submits on Enter", () => {
    let state = { line: "" };
    ({ state } = applyTerminalInput("sleep 30", state));
    expect(state.line).toBe("sleep 30");

    const result = applyTerminalInput("\r", state);
    expect(result.submitted).toBe("sleep 30");
    expect(result.state.line).toBe("");
  });

  it("does not include shell prompt text", () => {
    const result = applyTerminalInput("pnpm test\r", { line: "" });
    expect(result.submitted).toBe("pnpm test");
  });

  it("handles backspace", () => {
    let state = { line: "" };
    ({ state } = applyTerminalInput("slep", state));
    ({ state } = applyTerminalInput("\x7f", state));
    ({ state } = applyTerminalInput("p 30\r", state));
    expect(state.line).toBe("");
  });

  it("clears line on Ctrl+C", () => {
    let state = { line: "" };
    ({ state } = applyTerminalInput("partial", state));
    ({ state } = applyTerminalInput("\x03", state));
    expect(state.line).toBe("");
  });

  it("ignores empty Enter", () => {
    const result = applyTerminalInput("\r", { line: "" });
    expect(result.submitted).toBeUndefined();
  });
});
