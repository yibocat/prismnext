import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bibliographyLooksResolved } from "../../src/main/services/compiler";

describe("bibliographyLooksResolved", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "prism-bib-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("treats empty bibliography (no \\cite) as resolved when .bbl exists", () => {
    writeFileSync(
      join(dir, "main.bbl"),
      "% biblatex stub\n\\endgroup\n\\endinput\n",
      "utf-8",
    );
    const log = "LaTeX Warning: Empty bibliography on input line 99.\nOutput written on main.pdf (3 pages).\n";
    expect(bibliographyLooksResolved(dir, "main", log)).toBe(true);
  });

  it("fails when log reports undefined citations", () => {
    writeFileSync(join(dir, "main.bbl"), "\\entry{foo}{}\n", "utf-8");
    const log = "LaTeX Warning: Citation 'missing' on page 1 undefined on input line 10.\nOutput written on main.pdf (1 page).\n";
    expect(bibliographyLooksResolved(dir, "main", log)).toBe(false);
  });

  it("fails when .bbl is missing", () => {
    expect(bibliographyLooksResolved(dir, "main", "Output written on main.pdf.\n")).toBe(false);
  });
});
