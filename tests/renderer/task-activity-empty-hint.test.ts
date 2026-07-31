import { describe, it, expect } from "vitest";
import { taskActivityEmptyHint } from "@/components/modules/chat/tools/task-widget";

describe("taskActivityEmptyHint", () => {
  it("returns activityMissing when done with no blocks and no error", () => {
    expect(
      taskActivityEmptyHint({ status: "done", blocks: [] }),
    ).toBe("activityMissing");
  });

  it("returns null when run has an error", () => {
    expect(
      taskActivityEmptyHint({ status: "done", blocks: [], error: "await timeout" }),
    ).toBeNull();
  });

  it("returns null while running (without linkDegraded) or when blocks exist", () => {
    expect(taskActivityEmptyHint({ status: "running", blocks: [] })).toBeNull();
    expect(
      taskActivityEmptyHint({ status: "done", blocks: [{ type: "text", text: "hi" }] }),
    ).toBeNull();
  });

  it("returns activityLinking when linkDegraded and still waiting", () => {
    expect(
      taskActivityEmptyHint({ status: "running", blocks: [], linkDegraded: true }),
    ).toBe("activityLinking");
  });
});
