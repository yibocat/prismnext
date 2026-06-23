import { describe, expect, it } from "vitest";
import { linkLabelForUrl } from "../../src/renderer/lib/browser-link";

describe("browser-link normalize", () => {
  it("labels file URLs by filename", () => {
    expect(linkLabelForUrl("file:///tmp/report.html")).toBe("report.html");
  });
});
