import { describe, expect, it } from "vitest";
import {
  normalizePlanStatus,
  parsePlanSteps,
} from "../../src/renderer/lib/chat/parse-plan-steps";

describe("parsePlanSteps", () => {
  it("reads ACP-style entries with content + status", () => {
    expect(
      parsePlanSteps({
        entries: [
          { content: "Search literature", status: "completed" },
          { content: "Draft outline", status: "in_progress" },
        ],
      }),
    ).toEqual([
      { text: "Search literature", status: "completed" },
      { text: "Draft outline", status: "in_progress" },
    ]);
  });

  it("falls back to steps/plan/todos arrays and text aliases", () => {
    expect(
      parsePlanSteps({
        steps: [{ text: "Step A", status: "pending" }],
      }),
    ).toEqual([{ text: "Step A", status: "pending" }]);

    expect(
      parsePlanSteps({
        plan: [{ title: "Step B", status: "done" }],
      }),
    ).toEqual([{ text: "Step B", status: "completed" }]);
  });

  it("accepts a bare array payload", () => {
    expect(parsePlanSteps(["First", { content: "Second", status: "active" }])).toEqual([
      { text: "First", status: "pending" },
      { text: "Second", status: "in_progress" },
    ]);
  });

  it("returns empty for unknown shapes", () => {
    expect(parsePlanSteps(null)).toEqual([]);
    expect(parsePlanSteps({ foo: "bar" })).toEqual([]);
    expect(parsePlanSteps({ entries: [{ status: "pending" }] })).toEqual([]);
  });
});

describe("normalizePlanStatus", () => {
  it("normalizes common aliases", () => {
    expect(normalizePlanStatus("done")).toBe("completed");
    expect(normalizePlanStatus("in-progress")).toBe("in_progress");
    expect(normalizePlanStatus("active")).toBe("in_progress");
  });
});
