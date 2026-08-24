import { describe, it, expect } from "vitest";
import {
  seriesFileNameForVersion,
  normalizeVersion,
  extractVersionSection,
  resolveChangelogSection,
  normalizeReleaseFileBody,
} from "../../scripts/release/extract-changelog-section.mjs";
import {
  parseThemeSections,
  mergeForRelease,
  buildReleaseNotes,
  isInternalBullet,
} from "../../scripts/release/summarize-changelog-release.mjs";
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

  it("extracts a prerelease section without matching its stable version", () => {
    const prerelease = `## 0.7.0-beta.1 — 2026-08-13

### Beta
- preview

## 0.7.0 (Unreleased)

### Stable
- later
`;
    const body = extractVersionSection(prerelease, "0.7.0-beta.1");
    expect(body).toContain("preview");
    expect(body).not.toContain("later");
  });

  it("returns null when missing", () => {
    expect(extractVersionSection(sample, "0.5.99")).toBeNull();
  });
});

describe("normalizeReleaseFileBody", () => {
  it("strips generator comment and title", () => {
    const raw = `<!-- Generated -->

# Release notes — 0.8.0

### Chat
- hello
`;
    expect(normalizeReleaseFileBody(raw)).toBe("### Chat\n- hello");
  });
});

describe("resolveChangelogSection", () => {
  it("prefers releases/ file over series file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-changelog-"));
    fs.mkdirSync(path.join(dir, "releases"), { recursive: true });
    fs.mkdirSync(path.join(dir, "series"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "releases", "0.8.0.md"),
      "### Release\n- from releases\n",
    );
    fs.writeFileSync(
      path.join(dir, "series", "0.8.x.md"),
      `## 0.8.0 — 2026-01-01\n\n### Series\n- from series\n`,
    );
    const { file, body } = resolveChangelogSection("0.8.0", dir);
    expect(path.basename(path.dirname(file))).toBe("releases");
    expect(body).toContain("from releases");
  });

  it("falls back to series/ file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-changelog-"));
    fs.mkdirSync(path.join(dir, "series"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "series", "0.6.x.md"),
      `## 0.6.1 — 2026-01-01\n\n### From series\n- a\n`,
    );
    const { file, body } = resolveChangelogSection("0.6.1", dir);
    expect(file).toContain(`${path.sep}series${path.sep}0.6.x.md`);
    expect(body).toContain("From series");
  });

  it("falls back to legacy series path at changelog root", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-changelog-"));
    fs.writeFileSync(
      path.join(dir, "0.6.x.md"),
      `## 0.6.1 — 2026-01-01\n\n### Legacy root\n- a\n`,
    );
    const { file, body } = resolveChangelogSection("0.6.1", dir);
    expect(path.basename(file)).toBe("0.6.x.md");
    expect(body).toContain("Legacy root");
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

  it("preserves prerelease suffixes", () => {
    expect(normalizeVersion("v0.7.0-beta.1")).toBe("0.7.0-beta.1");
  });
});

describe("summarize-changelog-release", () => {
  it("skips Developer and Architecture sections", () => {
    const body = `### Chat
- user visible

### Developer
- src/main/foo refactored

### Architecture
- lib/desktop-api ports
`;
    const merged = mergeForRelease(parseThemeSections(body));
    expect(merged.has("Chat")).toBe(true);
    expect(merged.has("Developer")).toBe(false);
    expect(merged.has("Architecture")).toBe(false);
    expect(merged.has("Under the hood")).toBe(true);
  });

  it("flags internal bullets", () => {
    expect(isInternalBullet("Moved stores/chat to lib/chat")).toBe(true);
    expect(isInternalBullet("Left sidebar session rows show unread")).toBe(false);
  });

  it("builds release markdown", () => {
    const notes = buildReleaseNotes(
      "0.8.0",
      `Intro paragraph stays out until ### headers.

### Chat
- First bullet
- Second bullet
`,
    );
    expect(notes).toContain("### Chat");
    expect(notes).toContain("- First bullet");
    expect(notes).toContain("Intro paragraph stays out");
  });
});
