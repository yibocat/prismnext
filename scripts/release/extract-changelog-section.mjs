#!/usr/bin/env node
/**
 * Extract release notes for GitHub Releases.
 *
 * Layout (prism-next):
 *   changelog/releases/<version>.md  → summarized release notes (preferred)
 *   changelog/series/X.Y.x.md        → detailed dev log (fallback)
 *   changelog/X.Y.x.md               → legacy series path (fallback)
 *   changelog/CHANGELOG.md           → legacy / oldest history
 *
 * Usage:
 *   node scripts/release/extract-changelog-section.mjs <version> [changelogDir]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {string} version e.g. "0.5.14" or "v0.5.14"
 * @returns {string} e.g. "0.5.x.md"
 */
export function seriesFileNameForVersion(version) {
  const clean = String(version).replace(/^v/i, "").trim();
  const m = clean.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  return `${m[1]}.${m[2]}.x.md`;
}

/**
 * @param {string} version
 * @returns {string} normalized semver, including an optional prerelease suffix
 */
export function normalizeVersion(version) {
  const clean = String(version).replace(/^v/i, "").trim();
  const m = clean.match(/^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  if (!m) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  return m[1];
}

/**
 * Extract the markdown body under `## <version> …` until the next `## ` heading.
 * @param {string} markdown
 * @param {string} version normalized x.y.z
 * @returns {string | null}
 */
export function extractVersionSection(markdown, version) {
  const v = normalizeVersion(version);
  const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRe = new RegExp(`^## ${escaped}(?:\\s|[—(]|$)`, "m");
  const match = headerRe.exec(markdown);
  if (!match || match.index === undefined) {
    return null;
  }

  const afterHeader = markdown.indexOf("\n", match.index);
  const start = afterHeader === -1 ? markdown.length : afterHeader + 1;
  const rest = markdown.slice(start);
  const nextHeader = rest.search(/^## /m);
  const body = (nextHeader === -1 ? rest : rest.slice(0, nextHeader)).trim();
  return body.length > 0 ? body : null;
}

/**
 * Strip optional HTML comments and a top-level `# …` title from release files.
 * @param {string} markdown
 * @returns {string}
 */
export function normalizeReleaseFileBody(markdown) {
  let body = markdown.trim();
  body = body.replace(/^<!--[\s\S]*?-->\s*/m, "");
  body = body.replace(/^# [^\n]+\n+/, "");
  return body.trim();
}

/**
 * @param {string} version
 * @param {string} changelogRoot absolute or relative path to changelog/
 * @returns {{ file: string, body: string }}
 */
export function resolveChangelogSection(version, changelogRoot) {
  const v = normalizeVersion(version);
  const seriesName = seriesFileNameForVersion(v);
  const candidates = [
    {
      file: path.join(changelogRoot, "releases", `${v}.md`),
      kind: "release",
    },
    {
      file: path.join(changelogRoot, "series", seriesName),
      kind: "series",
    },
    {
      file: path.join(changelogRoot, seriesName),
      kind: "series",
    },
    {
      file: path.join(changelogRoot, "CHANGELOG.md"),
      kind: "series",
    },
  ];

  const tried = [];
  for (const { file, kind } of candidates) {
    tried.push(file);
    if (!fs.existsSync(file)) continue;
    const markdown = fs.readFileSync(file, "utf8");
    const body =
      kind === "release"
        ? normalizeReleaseFileBody(markdown)
        : extractVersionSection(markdown, v);
    if (body) {
      return { file, body };
    }
  }

  throw new Error(
    `No changelog section for ${v}. Looked for:\n` +
      `  - changelog/releases/${v}.md\n` +
      `  - ## ${v} in changelog/series/${seriesName}\n` +
      tried.map((f) => `  - ${f}`).join("\n") +
      `\nWhile developing, append to changelog/series/${seriesName}. Before release, run:\n` +
      `  pnpm release:changelog ${v}`,
  );
}

function main() {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: extract-changelog-section.mjs <version> [changelogDir]");
    process.exit(2);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const changelogRoot = process.argv[3] || path.join(here, "..", "..", "changelog");

  const { file, body } = resolveChangelogSection(version, changelogRoot);
  console.error(`# from ${path.relative(process.cwd(), file)}`);
  process.stdout.write(body + "\n");
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry.endsWith(`${path.sep}extract-changelog-section.mjs`)) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
