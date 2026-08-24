import { describe, expect, it } from "vitest";
import { nextExperimentRunHostKey } from "@/modes/experiments-mode/experiments-run-panel";

describe("experiment-run permission host key", () => {
  it("uses experiment-run:<id>:<nonce>", () => {
    const a = nextExperimentRunHostKey("exp-a");
    const b = nextExperimentRunHostKey("exp-a");
    expect(a).toMatch(/^experiment-run:exp-a:\d+$/);
    expect(b).toMatch(/^experiment-run:exp-a:\d+$/);
    expect(a).not.toBe(b);
  });
});
