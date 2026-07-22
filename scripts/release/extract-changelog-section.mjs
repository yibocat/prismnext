#!/usr/bin/env node
/**
 * Extract one version section from changelog series files for GitHub Releases.
 *
 * Layout convention (prism-next):
 *   changelog/0.5.x.md   → versions 0.5.*
 *   changelog/0.6.x.md   → versions 0.6.*
 *   changelog/2.1.x.md   → versions 2.1.*
 *   changelog/CHANGELOG.md → legacy / fallback when no series file exists
 *
 * Section headers look like:
 *   ## 0.5.14 — 2026-07-21
 *   ## 0.5.15 (Unreleased)
 *
 * Usage:
 *   node scripts/release/extract-changelog-section.mjs <version> [changelogDir]
 *   → prints section body (without the ## heading) to stdout
 *   exit 1 if not found
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
 * @returns {string} normalized "x.y.z" (no leading v)
 */
export function normalizeVersion(version) {
  const clean = String(version).replace(/^v/i, "").trim();
  const m = clean.match(/^(\d+\.\d+\.\d+)/);
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
  const escaped = v.replace(/\./g, "\\.");
  // ## 0.5.14 — date | ## 0.5.14 (Unreleased) | ## 0.5.14
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
 * @param {string} version
 * @param {string} changelogDir absolute or relative path to changelog/
 * @returns {{ file: string, body: string }}
 */
export function resolveChangelogSection(version, changelogDir) {
  const v = normalizeVersion(version);
  const seriesName = seriesFileNameForVersion(v);
  const candidates = [
    path.join(changelogDir, seriesName),
    path.join(changelogDir, "CHANGELOG.md"),
  ];

  const tried = [];
  for (const file of candidates) {
    tried.push(file);
    if (!fs.existsSync(file)) continue;
    const markdown = fs.readFileSync(file, "utf8");
    const body = extractVersionSection(markdown, v);
    if (body) {
      return { file, body };
    }
  }

  throw new Error(
    `No changelog section for ${v}. Looked for heading "## ${v}" in:\n` +
      tried.map((f) => `  - ${f}`).join("\n") +
      `\nCreate/update changelog/${seriesName} (or CHANGELOG.md) before releasing.`,
  );
}

function main() {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: extract-changelog-section.mjs <version> [changelogDir]");
    process.exit(2);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const changelogDir = process.argv[3] || path.join(here, "..", "..", "changelog");

  const { file, body } = resolveChangelogSection(version, changelogDir);
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
