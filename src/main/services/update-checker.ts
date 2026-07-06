// prism-next/src/main/services/update-checker.ts
// Lightweight update checker — fetches a version manifest from a local path
// or HTTPS url, compares semver, and caches the result. No electron-updater,
// no auto-download: the renderer prompts the user and opens the download URL
// via shell:openExternal. Field names mirror electron-builder's latest.yml so
// a future migration to electron-updater is a config swap, not a rewrite.

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getSettings, updateSettings } from "./settings";
import { createLogger } from "./logger";

const log = createLogger("update-checker", "general");

/** Fields mirror electron-builder's latest.yml. `path` is the download URL. */
export interface VersionInfo {
  version: string;
  path: string;
  releaseNotes?: string;
  pubDate?: string;
}

export type UpdateCheckResult =
  | { status: "up-to-date"; currentVersion: string }
  | { status: "available"; currentVersion: string; latest: VersionInfo }
  | { status: "ignored"; currentVersion: string; latest: VersionInfo }
  | { status: "error"; currentVersion: string; error: string }
  | { status: "no-source"; currentVersion: string };

/** Cached status surfaced via update:status without re-hitting the network. */
let cachedResult: UpdateCheckResult | null = null;

function currentVersion(): string {
  return app.getVersion();
}

/**
 * Compare two semver strings (e.g. "0.5.4" vs "0.5.3"). Returns 1 if a > b,
 * -1 if a < b, 0 if equal. Returns 0 on parse failure (treated as equal —
 * caller decides whether to treat unknown as "not an update").
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] => {
    const clean = v.replace(/^v/i, "").trim();
    const parts = clean.split(".").map((p) => parseInt(p, 10));
    // Pad to 3 segments; NaN → 0.
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3).map((n) => (Number.isNaN(n) ? 0 : n));
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function isValidVersionInfo(obj: unknown): obj is VersionInfo {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return typeof o.version === "string" && typeof o.path === "string";
}

/** Read the manifest from a local file path or an HTTPS url. */
async function fetchManifest(source: string): Promise<VersionInfo> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source, {
      // Short timeout — this runs on app startup / manual click.
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${source}`);
    }
    const text = await res.text();
    return JSON.parse(text) as VersionInfo;
  }
  // Local path — used for dev self-test.
  const abs = path.resolve(source);
  const text = await fs.promises.readFile(abs, "utf8");
  return JSON.parse(text) as VersionInfo;
}

/** Perform a check: hit the network, compare, consult the ignore cache. */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const cv = currentVersion();
  const source = getSettings().updateSource?.trim();

  if (!source) {
    const result: UpdateCheckResult = { status: "no-source", currentVersion: cv };
    cachedResult = result;
    return result;
  }

  try {
    const latest = await fetchManifest(source);
    if (!isValidVersionInfo(latest)) {
      throw new Error("Manifest is missing required fields (version, path)");
    }

    const cmp = compareVersions(latest.version, cv);
    const ignored = getSettings().ignoredUpdateVersion;

    if (cmp <= 0) {
      const result: UpdateCheckResult = { status: "up-to-date", currentVersion: cv };
      cachedResult = result;
      return result;
    }

    if (ignored && ignored === latest.version) {
      const result: UpdateCheckResult = {
        status: "ignored",
        currentVersion: cv,
        latest,
      };
      cachedResult = result;
      return result;
    }

    const result: UpdateCheckResult = {
      status: "available",
      currentVersion: cv,
      latest,
    };
    cachedResult = result;
    log.info(`Update available: ${latest.version} (current ${cv})`);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`Update check failed: ${message}`);
    const result: UpdateCheckResult = {
      status: "error",
      currentVersion: cv,
      error: message,
    };
    cachedResult = result;
    return result;
  }
}

/** Last check result without re-hitting the network. */
export function getCachedStatus(): UpdateCheckResult | null {
  return cachedResult;
}

/** Mark a version as ignored — won't surface as "available" until unignored. */
export function ignoreVersion(version: string): void {
  updateSettings({ ignoredUpdateVersion: version });
  // If the cached result was "available", flip it to "ignored" for instant UI.
  if (cachedResult?.status === "available" && cachedResult.latest.version === version) {
    cachedResult = {
      status: "ignored",
      currentVersion: cachedResult.currentVersion,
      latest: cachedResult.latest,
    };
  }
}

/** Clear the ignored-version flag. Uses "" rather than undefined because
 *  updateSettings() skips undefined values (treats them as "don't touch"). */
export function unignoreVersion(): void {
  updateSettings({ ignoredUpdateVersion: "" });
  if (cachedResult?.status === "ignored") {
    cachedResult = {
      status: "available",
      currentVersion: cachedResult.currentVersion,
      latest: cachedResult.latest,
    };
  }
}
