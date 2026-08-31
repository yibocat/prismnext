import type { CitationHealthReport } from "./citation-health-types";

/** Plain-text summary for /bib-check action card and chat feedback. */
export function formatCitationHealthReport(report: CitationHealthReport): string {
  const { bibCheck: bib, libraryCheck: lib, bibKeysNotInLibrary, bibFallback } = report;
  const lines: string[] = ["Citation health report", ""];

  lines.push(
    `Library (manuscript → library.db): ${lib.citeKeysInTex.length} keys in .tex/.typ`,
  );
  if (lib.missingKeys.length === 0) {
    lines.push("  ✓ All cited keys found in library");
  } else {
    lines.push(`  ✗ Missing in library (${lib.missingKeys.length}): ${lib.missingKeys.join(", ")}`);
  }
  if (lib.unusedKeys.length > 0) {
    lines.push(
      `  · Library papers not cited (${lib.unusedKeys.length}, informational): ${lib.unusedKeys.join(", ")}`,
    );
  }

  lines.push("");
  lines.push(`Manuscript .bib: ${bib.bibPath ?? "(not found)"}`);
  if (bib.missingKeys.length === 0 && bib.duplicateKeys.length === 0) {
    lines.push("  ✓ manuscript ↔ .bib aligned (no missing or duplicate keys)");
  } else {
    if (bib.missingKeys.length > 0) {
      lines.push(`  ✗ In manuscript but not in .bib (${bib.missingKeys.length}): ${bib.missingKeys.join(", ")}`);
    }
    if (bib.duplicateKeys.length > 0) {
      lines.push(`  ✗ Duplicate bib keys: ${bib.duplicateKeys.join(", ")}`);
    }
  }

  if (bibKeysNotInLibrary.length > 0) {
    lines.push("");
    lines.push(
      `Informational: .bib keys not in library (${bibKeysNotInLibrary.length}): ${bibKeysNotInLibrary.join(", ")}`,
    );
    lines.push("  (Not an audit failure unless a cited manuscript key is missing from the library.)");
  }

  const importable = bibFallback.filter((e) => e.canImportFromBib);
  if (importable.length > 0) {
    lines.push("");
    lines.push(`Importable from .bib into library: ${importable.map((e) => e.bibkey).join(", ")}`);
  }

  const gaps = bibFallback.filter((e) => !e.canImportFromBib);
  if (gaps.length > 0) {
    lines.push(`No .bib entry to import: ${gaps.map((e) => e.bibkey).join(", ")}`);
  }

  lines.push("");
  const ok =
    lib.missingKeys.length === 0
    && bib.missingKeys.length === 0
    && bib.duplicateKeys.length === 0;
  lines.push(ok ? "Overall: OK" : "Overall: issues found — fix library first, then literature-export-bib, then re-check.");

  return lines.join("\n");
}
