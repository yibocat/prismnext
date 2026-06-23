import { describe, expect, it } from "vitest";
import { parseOsc133Events, applyOsc133BusySequence, busyFromOsc133Events } from "../../src/renderer/lib/terminal/osc";
import { isTerminalCommandBusy } from "../../src/renderer/lib/terminal/root";

describe("terminal-osc", () => {
  it("parses OSC 133 command start and end", () => {
    const data = "hello\x1b]133;C\x07world\x1b]133;D;0\x07";
    const events = parseOsc133Events(data);
    expect(events).toContain("commandStart");
    expect(events).toContain("commandEnd");
    expect(busyFromOsc133Events(events)).toBe(false);
  });

  it("marks busy on command start only", () => {
    const events = parseOsc133Events("\x1b]133;C\x07");
    expect(busyFromOsc133Events(events)).toBe(true);
  });

  it("keeps busy during long-running command until command end", () => {
    const start = parseOsc133Events("\x1b]133;C\x07");
    expect(applyOsc133BusySequence(start, false)).toBe(true);
    // No output during sleep — busy stays true
    expect(applyOsc133BusySequence([], true)).toBe(true);
    const end = parseOsc133Events("\x1b]133;D;0\x07\x1b]133;A\x07");
    expect(applyOsc133BusySequence(end, true)).toBe(false);
  });
});

describe("terminal-root busy", () => {
  it("only treats explicit busy flag as command running", () => {
    expect(isTerminalCommandBusy(true)).toBe(true);
    expect(isTerminalCommandBusy(false)).toBe(false);
    expect(isTerminalCommandBusy(undefined)).toBe(false);
  });
});
