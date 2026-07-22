// prism-next/src/main/services/update-checker.ts
// App updater — electron-updater (generic → R2 feed) when packaged;
// JSON version.json / local path remains for unpackaged local QA.
// autoDownload is off: renderer confirms before download (Task 6 UI).

import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
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

/**
 * Primary updater status (Task 5+).
 * Extended with `ignored` for current About UI; Task 6 adds download/install UX.
 * `latest` kept for openExternal fallback until Task 6 migrates the renderer.
 */
export type UpdaterStatus = {
  status:
    | "idle"
    | "checking"
    | "up-to-date"
    | "available"
    | "downloading"
    | "downloaded"
    | "error"
    | "no-source"
    | "ignored";
  currentVersion: string;
  latestVersion?: string;
  progress?: { percent: number };
  error?: string;
  releaseNotes?: string;
  /** Compat for About openExternal — prefer downloadUpdate() after Task 6. */
  latest?: VersionInfo;
};

/**
 * Legacy IPC shape (available / ignored / …). Prefer UpdaterStatus.
 * Kept so Task 6 can migrate renderer types without a hard cut.
 */
export type UpdateCheckResult =
  | { status: "up-to-date"; currentVersion: string }
  | { status: "available"; currentVersion: string; latest: VersionInfo }
  | { status: "ignored"; currentVersion: string; latest: VersionInfo }
  | { status: "error"; currentVersion: string; error: string }
  | { status: "no-source"; currentVersion: string };

let cachedStatus: UpdaterStatus = {
  status: "idle",
  currentVersion: "0.0.0",
};
let initialized = false;
let configuredFeed = "";

function currentVersion(): string {
  try {
    return app.getVersion();
  } catch {
    return "0.0.0";
  }
}

function setStatus(next: UpdaterStatus): UpdaterStatus {
  cachedStatus = next;
  return next;
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

/** Build-time default feed root (electron-vite `define`; empty when unset). */
declare const __PRISM_UPDATER_BASE_URL__: string;

/** Default generic feed root (no trailing slash). Packaged builds bake URL at compile time. */
export function resolveDefaultFeedUrl(): string {
  const fromEnv = process.env.PRISM_UPDATER_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const baked = __PRISM_UPDATER_BASE_URL__;
  if (typeof baked === "string" && baked.trim()) return baked.trim().replace(/\/$/, "");
  return "";
}

/** Settings override, else default feed. Empty → no update source. */
export function resolveFeedUrl(): string {
  const override = getSettings().updateSource?.trim();
  if (override) return override.replace(/\/$/, "");
  return resolveDefaultFeedUrl();
}

function isValidVersionInfo(obj: unknown): obj is VersionInfo {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return typeof o.version === "string" && typeof o.path === "string";
}

function releaseNotesText(notes: unknown): string | undefined {
  if (typeof notes === "string" && notes.trim()) return notes;
  if (Array.isArray(notes)) {
    const joined = notes
      .map((n) => {
        if (typeof n === "string") return n;
        if (n && typeof n === "object" && "note" in n) {
          const note = (n as { note?: unknown }).note;
          return typeof note === "string" ? note : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
    return joined || undefined;
  }
  return undefined;
}

function artifactUrlFromUpdateInfo(feed: string, info: { path?: string; files?: Array<{ url?: string }> }): string {
  const fileUrl = info.files?.[0]?.url?.trim();
  if (fileUrl && /^https?:\/\//i.test(fileUrl)) return fileUrl;
  const rel = (fileUrl || info.path || "").replace(/^\//, "");
  if (!rel) return feed;
  if (/^https?:\/\//i.test(rel)) return rel;
  return `${feed.replace(/\/$/, "")}/${rel}`;
}

function versionInfoFromUpdate(
  feed: string,
  info: { version: string; path?: string; files?: Array<{ url?: string }>; releaseNotes?: unknown; releaseDate?: string },
): VersionInfo {
  return {
    version: info.version,
    path: artifactUrlFromUpdateInfo(feed, info),
    releaseNotes: releaseNotesText(info.releaseNotes),
    pubDate: info.releaseDate,
  };
}

/** Read the manifest from a local file path or an HTTPS url. */
async function fetchManifest(source: string): Promise<VersionInfo> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source, {
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${source}`);
    }
    const text = await res.text();
    return JSON.parse(text) as VersionInfo;
  }
  const abs = path.resolve(source);
  const text = await fs.promises.readFile(abs, "utf8");
  return JSON.parse(text) as VersionInfo;
}

/** True when source looks like a version.json manifest (not a generic feed root). */
function looksLikeManifestSource(source: string): boolean {
  if (!/^https?:\/\//i.test(source)) return true;
  return /\.json(\?|$)/i.test(source);
}

function broadcastProgress(percent: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("update:progress", { percent });
    }
  }
}

function applyFeedUrl(feed: string): void {
  if (!feed || configuredFeed === feed) return;
  autoUpdater.setFeedURL({ provider: "generic", url: feed });
  configuredFeed = feed;
}

/**
 * Call once after app.whenReady(). Safe to call again (no-op after first).
 */
export function initAppUpdater(): void {
  if (initialized) return;
  initialized = true;

  cachedStatus = { status: "idle", currentVersion: currentVersion() };

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const feed = resolveFeedUrl();
  if (feed && app.isPackaged) {
    try {
      applyFeedUrl(feed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`Failed to set update feed: ${message}`);
    }
  }

  autoUpdater.on("download-progress", (p) => {
    const percent = typeof p?.percent === "number" ? p.percent : 0;
    setStatus({
      status: "downloading",
      currentVersion: currentVersion(),
      latestVersion: cachedStatus.latestVersion,
      releaseNotes: cachedStatus.releaseNotes,
      latest: cachedStatus.latest,
      progress: { percent },
    });
    broadcastProgress(percent);
  });

  autoUpdater.on("update-downloaded", (info) => {
    const feedUrl = resolveFeedUrl();
    const latest = feedUrl ? versionInfoFromUpdate(feedUrl, info) : cachedStatus.latest;
    setStatus({
      status: "downloaded",
      currentVersion: currentVersion(),
      latestVersion: info.version,
      releaseNotes: releaseNotesText(info.releaseNotes) ?? cachedStatus.releaseNotes,
      latest,
      progress: { percent: 100 },
    });
  });

  autoUpdater.on("error", (err) => {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`autoUpdater error: ${message}`);
    // Don't clobber a successful downloaded state on late errors.
    if (cachedStatus.status === "downloaded") return;
    setStatus({
      status: "error",
      currentVersion: currentVersion(),
      error: message,
      latestVersion: cachedStatus.latestVersion,
      latest: cachedStatus.latest,
    });
  });

  log.info("App updater initialized", {
    packaged: app.isPackaged,
    feed: feed || "(none)",
  });
}

function mapIgnoredOrAvailable(cv: string, latest: VersionInfo): UpdaterStatus {
  const ignored = getSettings().ignoredUpdateVersion;
  if (ignored && ignored === latest.version) {
    return {
      status: "ignored",
      currentVersion: cv,
      latestVersion: latest.version,
      releaseNotes: latest.releaseNotes,
      latest,
    };
  }
  return {
    status: "available",
    currentVersion: cv,
    latestVersion: latest.version,
    releaseNotes: latest.releaseNotes,
    latest,
  };
}

/** Unpackaged / QA: JSON manifest at source, or `${feed}/version.json`. */
async function checkViaManifest(source: string): Promise<UpdaterStatus> {
  const cv = currentVersion();
  const manifestUrl = looksLikeManifestSource(source)
    ? source
    : `${source.replace(/\/$/, "")}/version.json`;

  try {
    const latest = await fetchManifest(manifestUrl);
    if (!isValidVersionInfo(latest)) {
      throw new Error("Manifest is missing required fields (version, path)");
    }

    const cmp = compareVersions(latest.version, cv);
    if (cmp <= 0) {
      return setStatus({ status: "up-to-date", currentVersion: cv });
    }

    const mapped = mapIgnoredOrAvailable(cv, latest);
    if (mapped.status === "available") {
      log.info(`Update available (manifest): ${latest.version} (current ${cv})`);
    }
    return setStatus(mapped);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`Manifest update check failed: ${message}`);
    return setStatus({ status: "error", currentVersion: cv, error: message });
  }
}

async function checkViaElectronUpdater(feed: string): Promise<UpdaterStatus> {
  const cv = currentVersion();
  applyFeedUrl(feed);

  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result) {
      return setStatus({
        status: "error",
        currentVersion: cv,
        error: "Updater is disabled or returned no result",
      });
    }

    const info = result.updateInfo;
    if (!result.isUpdateAvailable || compareVersions(info.version, cv) <= 0) {
      return setStatus({ status: "up-to-date", currentVersion: cv });
    }

    const latest = versionInfoFromUpdate(feed, info);
    const mapped = mapIgnoredOrAvailable(cv, latest);
    if (mapped.status === "available") {
      log.info(`Update available: ${latest.version} (current ${cv})`);
    }
    return setStatus(mapped);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`Update check failed: ${message}`);
    return setStatus({ status: "error", currentVersion: cv, error: message });
  }
}

/** Perform a check against the configured feed. */
export async function checkForUpdates(): Promise<UpdaterStatus> {
  const cv = currentVersion();
  setStatus({ status: "checking", currentVersion: cv });

  const feed = resolveFeedUrl();
  if (!feed) {
    return setStatus({ status: "no-source", currentVersion: cv });
  }

  // Unpackaged: electron-updater needs app-update.yml; use JSON QA path instead.
  if (!app.isPackaged) {
    return checkViaManifest(feed);
  }

  return checkViaElectronUpdater(feed);
}

/** Download the pending update (requires a prior successful check). */
export async function downloadUpdate(): Promise<UpdaterStatus> {
  const cv = currentVersion();
  if (!app.isPackaged) {
    return setStatus({
      status: "error",
      currentVersion: cv,
      error: "In-app download requires a packaged build. Use the download link instead.",
      latestVersion: cachedStatus.latestVersion,
      latest: cachedStatus.latest,
    });
  }

  if (
    cachedStatus.status !== "available" &&
    cachedStatus.status !== "ignored" &&
    cachedStatus.status !== "downloading" &&
    cachedStatus.status !== "downloaded"
  ) {
    return setStatus({
      status: "error",
      currentVersion: cv,
      error: "No update available to download. Check for updates first.",
    });
  }

  if (cachedStatus.status === "downloaded") {
    return cachedStatus;
  }

  const feed = resolveFeedUrl();
  if (feed) applyFeedUrl(feed);

  setStatus({
    status: "downloading",
    currentVersion: cv,
    latestVersion: cachedStatus.latestVersion,
    releaseNotes: cachedStatus.releaseNotes,
    latest: cachedStatus.latest,
    progress: { percent: cachedStatus.progress?.percent ?? 0 },
  });

  try {
    await autoUpdater.downloadUpdate();
    // Prefer the update-downloaded handler's cache; fall back if the event raced.
    const after = getUpdaterStatus();
    if (after.status === "downloaded") return after;
    return setStatus({
      status: "downloaded",
      currentVersion: cv,
      latestVersion: after.latestVersion,
      releaseNotes: after.releaseNotes,
      latest: after.latest,
      progress: { percent: 100 },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`Update download failed: ${message}`);
    return setStatus({
      status: "error",
      currentVersion: cv,
      error: message,
      latestVersion: cachedStatus.latestVersion,
      latest: cachedStatus.latest,
    });
  }
}

/** Restart and install a downloaded update. */
export function quitAndInstall(): void {
  autoUpdater.quitAndInstall(false, true);
}

/** Last known status without re-hitting the network. */
export function getUpdaterStatus(): UpdaterStatus {
  return {
    ...cachedStatus,
    currentVersion: cachedStatus.currentVersion || currentVersion(),
  };
}

/**
 * Legacy cached result for existing IPC (`update:status`).
 * Returns null while idle/checking so About UI keeps treating that as idle.
 */
export function getCachedStatus(): UpdateCheckResult | null {
  return toLegacyResult(getUpdaterStatus());
}

/** Map UpdaterStatus → legacy UpdateCheckResult for current About / welcome UI. */
export function toLegacyResult(status: UpdaterStatus): UpdateCheckResult | null {
  switch (status.status) {
    case "up-to-date":
      return { status: "up-to-date", currentVersion: status.currentVersion };
    case "available":
      if (!status.latest) return null;
      return {
        status: "available",
        currentVersion: status.currentVersion,
        latest: status.latest,
      };
    case "ignored":
      if (!status.latest) return null;
      return {
        status: "ignored",
        currentVersion: status.currentVersion,
        latest: status.latest,
      };
    case "error":
      return {
        status: "error",
        currentVersion: status.currentVersion,
        error: status.error ?? "Unknown error",
      };
    case "no-source":
      return { status: "no-source", currentVersion: status.currentVersion };
    default:
      // idle | checking | downloading | downloaded — Task 6 uses getUpdaterStatus
      return null;
  }
}

/** Mark a version as ignored — won't surface as "available" until unignored. */
export function ignoreVersion(version: string): void {
  updateSettings({ ignoredUpdateVersion: version });
  if (cachedStatus.status === "available" && cachedStatus.latestVersion === version) {
    setStatus({
      ...cachedStatus,
      status: "ignored",
    });
  }
}

/** Clear the ignored-version flag. Uses "" rather than undefined because
 *  updateSettings() skips undefined values (treats them as "don't touch"). */
export function unignoreVersion(): void {
  updateSettings({ ignoredUpdateVersion: "" });
  if (cachedStatus.status === "ignored") {
    setStatus({
      ...cachedStatus,
      status: "available",
    });
  }
}
