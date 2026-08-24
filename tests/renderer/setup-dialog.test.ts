import { describe, it, expect } from "vitest";
import { formatMissingEntry } from "@/components/modules/project/setup-dialog";

describe("formatMissingEntry", () => {
  it("prefixes the project folder and keeps a single trailing slash for dirs", () => {
    expect(formatMissingEntry("/Users/me/ceshi", ".workbench/")).toBe("ceshi/.workbench/");
    expect(formatMissingEntry("/Users/me/ceshi/", ".workbench/")).toBe("ceshi/.workbench/");
  });

  it("does not add a slash to missing files", () => {
    expect(formatMissingEntry("/Users/me/ceshi", ".workbench/settings.json")).toBe(
      "ceshi/.workbench/settings.json",
    );
  });
});
