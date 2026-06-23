import { describe, expect, it } from "vitest";
import {
  stripTerminalAnsi,
  appendTerminalCapture,
  getLastCommandBlockFromBuffer,
} from "../../src/renderer/lib/terminal/buffer";

describe("terminal-buffer", () => {
  it("strips ANSI and OSC sequences", () => {
    expect(stripTerminalAnsi("\x1b[1;32mok\x1b[0m")).toBe("ok");
    expect(stripTerminalAnsi("a\x1b]133;C\x07b")).toBe("ab");
  });

  it("appends capture chunks", () => {
    const merged = appendTerminalCapture("line1\n", "\x1b[32mline2\r\n");
    expect(merged).toContain("line1");
    expect(stripTerminalAnsi(merged)).toContain("line2");
  });

  it("finds last command block in buffer", () => {
    const lines: string[] = [];
    const buffer = {
      length: 4,
      viewportY: 0,
      getLine: (i: number) => ({
        translateToString: () => lines[i] ?? "",
      }),
    };
    lines[0] = "prompt $ npm test";
    lines[1] = "PASS ok";
    lines[2] = "prompt $ ";
    lines[3] = "";

    const term = {
      rows: 4,
      buffer: { active: buffer },
    } as unknown as import("@xterm/xterm").Terminal;

    const block = getLastCommandBlockFromBuffer(term, "npm test");
    expect(block.command).toBe("npm test");
    expect(block.output).toContain("PASS ok");
  });
});
