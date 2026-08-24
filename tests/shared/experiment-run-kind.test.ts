import { describe, expect, it } from "vitest";
import {
  EXPERIMENT_RUN_KINDS,
  parseExperimentRunKind,
} from "../../src/shared/experiments/log";

describe("parseExperimentRunKind", () => {
  it("accepts canonical kinds (case-insensitive trim)", () => {
    for (const k of EXPERIMENT_RUN_KINDS) {
      expect(parseExperimentRunKind(k)).toBe(k);
      expect(parseExperimentRunKind(` ${k.toUpperCase()} `)).toBe(k);
    }
  });

  it("returns undefined for empty / unknown (never invents other)", () => {
    expect(parseExperimentRunKind(undefined)).toBeUndefined();
    expect(parseExperimentRunKind("")).toBeUndefined();
    expect(parseExperimentRunKind("   ")).toBeUndefined();
    expect(parseExperimentRunKind("training")).toBeUndefined();
    expect(parseExperimentRunKind(1)).toBeUndefined();
  });
});
