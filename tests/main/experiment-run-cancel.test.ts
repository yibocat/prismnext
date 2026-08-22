import { afterEach, describe, expect, it } from "vitest";
import {
  markExperimentRunCancelled,
  _consumeExperimentRunCancelledForTests,
  _resetExperimentRunCancelledForTests,
} from "../../src/main/experiment/experiment-run-executor";

describe("markExperimentRunCancelled (Bug #21)", () => {
  afterEach(() => {
    _resetExperimentRunCancelledForTests();
  });

  it("marks a run as cancelled until consumed once", () => {
    markExperimentRunCancelled("exp-a", "run-1");
    expect(_consumeExperimentRunCancelledForTests("exp-a", "run-1")).toBe(true);
    expect(_consumeExperimentRunCancelledForTests("exp-a", "run-1")).toBe(false);
  });

  it("ignores empty ids", () => {
    markExperimentRunCancelled("", "run-1");
    markExperimentRunCancelled("exp-a", "");
    expect(_consumeExperimentRunCancelledForTests("exp-a", "run-1")).toBe(false);
  });
});
