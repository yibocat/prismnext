import { describe, expect, it } from "vitest";
import { interactionThumbnailRelPath } from "../../src/shared/interaction-artifacts-path";

describe("interactionThumbnailRelPath", () => {
  it("builds the host-managed thumbnail path under .prismnext/artifacts/<id>/", () => {
    expect(interactionThumbnailRelPath("demo.saddle")).toBe(
      ".prismnext/artifacts/demo.saddle/.thumbnail.png",
    );
  });

  it("trims the id", () => {
    expect(interactionThumbnailRelPath("  demo.saddle  ")).toBe(
      ".prismnext/artifacts/demo.saddle/.thumbnail.png",
    );
  });
});
