import { describe, expect, it } from "vitest";
import { selectExtractProgressForPaper } from "@/stores/literature-extract-store";
import type { PaperExtractProgress } from "@/types/electron.d";

describe("selectExtractProgressForPaper", () => {
  const progress: PaperExtractProgress = {
    paperId: "paper-1",
    source: "mineru",
    phase: "cloud_extracting",
    message: "MinerU processing…",
    percent: 42,
  };

  it("returns progress for the matching paper id", () => {
    expect(
      selectExtractProgressForPaper({ "paper-1::mineru": progress }, "paper-1"),
    ).toEqual(progress);
  });

  it("returns null when no progress exists for the paper", () => {
    expect(selectExtractProgressForPaper({}, "paper-1")).toBeNull();
    expect(
      selectExtractProgressForPaper({ "paper-2::pdfjs": progress }, "paper-1"),
    ).toBeNull();
  });
});
