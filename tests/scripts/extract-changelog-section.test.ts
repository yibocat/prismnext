import { describe, it, expect } from "vitest";
import {
  seriesFileNameForVersion,
  normalizeVersion,
  extractVersionSection,
  resolveChangelogSection,
} from "../../scripts/release/extract-changelog-section.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("seriesFileNameForVersion", () => {
  it("maps patch versions to major.minor.x.md", () => {
    expect(seriesFileNameForVersion("0.5.14")).toBe("0.5.x.md");
    expect(seriesFileNameForVersion("v0.6.0")).toBe("0.6.x.md");
    expect(seriesFileNameForVersion("2.1.3")).toBe("2.1.x.md");
  });
});

describe("extractVersionSection", () => {
  const sample = `# Changelog — 0.5.x

## 0.5.15 (Unreleased)

### New
- upcoming

## 0.5.14 — 2026-07-21

### Fixed
- something

## 0.5.13 — 2026-07-18

### Older
- past
`;

  it("extracts dated release section", () => {
    const body = extractVersionSection(sample, "0.5.14");
    expect(body).toContain("### Fixed");
    expect(body).toContain("- something");
    expect(body).not.toContain("0.5.13");
    expect(body).not.toContain("upcoming");
  });

  it("extracts Unreleased section for same version", () => {
    const body = extractVersionSection(sample, "0.5.15");
    expect(body).toContain("upcoming");
    expect(body).not.toContain("something");
  });

  it("returns null when missing", () => {
    expect(extractVersionSection(sample, "0.5.99")).toBeNull();
  });
});

describe("resolveChangelogSection", () => {
  it("prefers series file over CHANGELOG.md", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-changelog-"));
    fs.writeFileSync(
      path.join(dir, "0.6.x.md"),
      `## 0.6.1 — 2026-01-01\n\n### From series\n- a\n`,
    );
    fs.writeFileSync(
      path.join(dir, "CHANGELOG.md"),
      `## 0.6.1 — 2026-01-01\n\n### From legacy\n- b\n`,
    );
    const { file, body } = resolveChangelogSection("0.6.1", dir);
    expect(path.basename(file)).toBe("0.6.x.md");
    expect(body).toContain("From series");
  });

  it("falls back to CHANGELOG.md", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-changelog-"));
    fs.writeFileSync(
      path.join(dir, "CHANGELOG.md"),
      `## 0.4.5 — 2026-06-28\n\n### Legacy\n- old\n`,
    );
    const { file, body } = resolveChangelogSection("0.4.5", dir);
    expect(path.basename(file)).toBe("CHANGELOG.md");
    expect(body).toContain("Legacy");
  });
});

describe("normalizeVersion", () => {
  it("strips v prefix", () => {
    expect(normalizeVersion("v2.1.0")).toBe("2.1.0");
  });

  it("keeps prerelease identifiers", () => {
    expect(normalizeVersion("0.6.6-alpha.1")).toBe("0.6.6-alpha.1");
    expect(normalizeVersion("v0.6.6-alpha.1")).toBe("0.6.6-alpha.1");
  });
});

describe("extractVersionSection prerelease", () => {
  const sample = `# Changelog — 0.6.x

## 0.6.6 (Unreleased)

### Later
- stable WIP

## 0.6.6-alpha.1 — 2026-07-29

### Alpha
- interaction

## 0.6.5 — 2026-07-28

### Stable
- shipped
`;

  it("extracts alpha section without matching bare 0.6.6", () => {
    const body = extractVersionSection(sample, "0.6.6-alpha.1");
    expect(body).toContain("interaction");
    expect(body).not.toContain("stable WIP");
    expect(body).not.toContain("shipped");
  });

  it("maps prerelease to the same series file", () => {
    expect(seriesFileNameForVersion("0.6.6-alpha.1")).toBe("0.6.x.md");
  });
});
