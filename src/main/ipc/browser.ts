import { BrowserWindow, app, ipcMain, session } from "electron";
import type { WebContents } from "electron";
import * as fs from "fs";
import * as path from "path";
import { createLogger } from "../services/logger";

const log = createLogger("browser-ipc", "ipc");

const BROWSER_DIR = ".prismnext/browser";

/**
 * Partition used by the in-app browser `<webview>` (see browser-view.tsx).
 * Isolates browser cookies/storage/cache from the renderer's default session so
 * that (a) clearing browser data doesn't wipe app session state, and (b) any
 * CSP / permission policy on the default session doesn't leak to web content.
 * `persist:` keeps login state across restarts.
 */
const BROWSER_PARTITION = "persist:browser";

export function isBrowserGuestOpenUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "file:";
  } catch {
    return false;
  }
}

function notifyRendererOpenInTab(guest: WebContents, url: string): void {
  const payload = { url, newTab: true };
  const embedder = guest.hostWebContents;
  if (embedder && !embedder.isDestroyed()) {
    embedder.send("browser:open-in-tab", payload);
    return;
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("browser:open-in-tab", payload);
  }
}

function attachGuestWindowHandler(contents: WebContents): void {
  if (contents.getType() !== "webview") return;
  try {
    if (contents.session !== session.fromPartition(BROWSER_PARTITION)) return;
  } catch {
    return;
  }
  contents.setWindowOpenHandler(({ url }) => {
    if (isBrowserGuestOpenUrl(url)) {
      notifyRendererOpenInTab(contents, url);
    }
    return { action: "deny" };
  });
}

interface Bookmark {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  createdAt: number;
  order: number;
}

interface RecentVisit {
  url: string;
  title: string;
  visitedAt: number;
}

interface BrowserState {
  bookmarks: Bookmark[];
  recent: RecentVisit[];
  maxRecentItems: number;
}

const SEED_BOOKMARKS: Bookmark[] = [
  { id: "seed-1", title: "Google Scholar", url: "https://scholar.google.com", favicon: "", createdAt: 0, order: 0 },
  { id: "seed-2", title: "arXiv", url: "https://arxiv.org", favicon: "", createdAt: 0, order: 1 },
  { id: "seed-3", title: "DOI Resolver", url: "https://doi.org", favicon: "", createdAt: 0, order: 2 },
  { id: "seed-4", title: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov", favicon: "", createdAt: 0, order: 3 },
  { id: "seed-5", title: "dblp", url: "https://dblp.org", favicon: "", createdAt: 0, order: 4 },
  { id: "seed-6", title: "Semantic Scholar", url: "https://www.semanticscholar.org", favicon: "", createdAt: 0, order: 5 },
];

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
    }
  } catch {
    log.warn("Failed to read or parse browser state, using fallback", {
      file: path.basename(filePath),
    });
  }
  return fallback;
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function initBrowserState(projectRoot: string): BrowserState {
  const dir = path.join(projectRoot, BROWSER_DIR);
  ensureDir(dir);

  const bookmarksPath = path.join(dir, "bookmarks.json");
  const recentPath = path.join(dir, "recent.json");
  const settingsPath = path.join(dir, "settings.json");

  let bookmarks: Bookmark[];
  if (!fs.existsSync(bookmarksPath)) {
    bookmarks = SEED_BOOKMARKS.map((b) => ({ ...b, createdAt: Date.now() }));
    writeJson(bookmarksPath, bookmarks);
  } else {
    bookmarks = readJson<Bookmark[]>(bookmarksPath, []);
  }

  const recent = readJson<RecentVisit[]>(recentPath, []);
  const settings = readJson<{ maxRecentItems?: number }>(settingsPath, {});
  const maxRecentItems = settings.maxRecentItems ?? 50;

  return { bookmarks, recent, maxRecentItems };
}

export function registerBrowserHandlers(): void {
  app.on("web-contents-created", (_event, contents) => {
    attachGuestWindowHandler(contents);
  });

  ipcMain.handle("browser:init", async (_event, { projectRoot }: { projectRoot: string }) => {
    return initBrowserState(projectRoot);
  });

  ipcMain.handle("browser:saveBookmarks", async (_event, { projectRoot, bookmarks }: { projectRoot: string; bookmarks: Bookmark[] }) => {
    try {
      const dir = path.join(projectRoot, BROWSER_DIR);
      ensureDir(dir);
      writeJson(path.join(dir, "bookmarks.json"), bookmarks);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? "Unknown error" };
    }
  });

  ipcMain.handle("browser:saveRecent", async (_event, { projectRoot, recent }: { projectRoot: string; recent: RecentVisit[] }) => {
    try {
      const dir = path.join(projectRoot, BROWSER_DIR);
      ensureDir(dir);
      writeJson(path.join(dir, "recent.json"), recent);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? "Unknown error" };
    }
  });

  ipcMain.handle("browser:clearCookies", async () => {
    try {
      await session.fromPartition(BROWSER_PARTITION).clearStorageData({ storages: ["cookies"] });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? "Unknown error" };
    }
  });

  ipcMain.handle("browser:clearCache", async () => {
    try {
      const browserSession = session.fromPartition(BROWSER_PARTITION);
      await browserSession.clearCache();
      // Also clear localStorage / service worker caches for all origins
      await browserSession.clearStorageData({
        storages: ["localstorage", "serviceworkers", "cachestorage", "indexdb"],
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? "Unknown error" };
    }
  });
}
