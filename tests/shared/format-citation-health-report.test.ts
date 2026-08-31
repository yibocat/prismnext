import { describe, it, expect } from "vitest";
import { formatCitationHealthReport } from "../../src/shared/literature/format-citation-health-report";
import type { CitationHealthReport } from "../../src/shared/literature/citation-health-types";

const baseReport: CitationHealthReport = {
  libraryCheck: {
    texFilesScanned: 1,
    citeKeysInTex: ["a", "b"],
    knownKeys: ["a"],
    missingKeys: ["b"],
    unusedKeys: [],
  },
  bibCheck: {
    texFilesScanned: 1,
    bibPath: "manuscript/references.bib",
    citeKeysInTex: ["a", "b"],
    keysInBib: ["a"],
    missingKeys: ["b"],
    unusedKeys: [],
    duplicateKeys: [],
  },
  bibFallback: [],
  bibKeysNotInLibrary: [],
};

describe("formatCitationHealthReport", () => {
  it("summarizes missing keys and overall status", () => {
    const text = formatCitationHealthReport(baseReport);
    expect(text).toContain("Missing in library");
    expect(text).toContain("b");
    expect(text).toContain("Overall: issues found");
  });

  it("reports OK when aligned", () => {
    const ok: CitationHealthReport = {
      ...baseReport,
      libraryCheck: { ...baseReport.libraryCheck, missingKeys: [], knownKeys: ["a", "b"] },
      bibCheck: { ...baseReport.bibCheck, missingKeys: [], keysInBib: ["a", "b"] },
    };
    expect(formatCitationHealthReport(ok)).toContain("Overall: OK");
  });

  it("reports OK when library has uncited papers (informational only)", () => {
    const ok: CitationHealthReport = {
      ...baseReport,
      libraryCheck: {
        ...baseReport.libraryCheck,
        missingKeys: [],
        knownKeys: ["a", "b", "unused-in-lib"],
        unusedKeys: ["unused-in-lib"],
      },
      bibCheck: { ...baseReport.bibCheck, missingKeys: [], keysInBib: ["a", "b"] },
      bibKeysNotInLibrary: ["extra-bib-only"],
    };
    const text = formatCitationHealthReport(ok);
    expect(text).toContain("informational");
    expect(text).toContain("Overall: OK");
  });
});
