import { describe, it, expect } from "vitest";
import { formatMissingEntry } from "@/components/modules/project/setup-dialog";

describe("formatMissingEntry", () => {
  it("prefixes the project folder and keeps a single trailing slash for dirs", () => {
    expect(formatMissingEntry("/Users/me/ceshi", ".prismnext/")).toBe("ceshi/.prismnext/");
    expect(formatMissingEntry("/Users/me/ceshi/", ".prismnext/")).toBe("ceshi/.prismnext/");
  });

  it("does not add a slash to missing files", () => {
    expect(formatMissingEntry("/Users/me/ceshi", ".prismnext/settings.json")).toBe(
      "ceshi/.prismnext/settings.json",
    );
  });
});
