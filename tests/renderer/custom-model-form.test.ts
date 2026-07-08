import { describe, expect, it } from "vitest";
import {
  buildCustomModelEntry,
  modelIdTaken,
} from "../../src/renderer/lib/providers";

describe("custom model form helpers", () => {
  const presets = [{ id: "glm-5.1", name: "GLM-5.1", contextWindow: "200K" }];

  it("detects duplicate model ids", () => {
    expect(modelIdTaken("glm-5.1", presets, [])).toBe(true);
    expect(modelIdTaken("glm-5.2", presets, [{ id: "glm-5.2", name: "GLM-5.2", contextWindow: "200K" }])).toBe(
      true,
    );
    expect(modelIdTaken("new-model", presets, [])).toBe(false);
  });

  it("builds custom model with optional display name and context", () => {
    expect(buildCustomModelEntry("foo/bar")).toEqual({
      id: "foo/bar",
      name: "foo/bar",
      contextWindow: "Unknown",
    });
    expect(buildCustomModelEntry("foo/bar", "My Model", "256K")).toEqual({
      id: "foo/bar",
      name: "My Model",
      contextWindow: "256K",
    });
  });
});
