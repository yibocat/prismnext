import { mkdirSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, posix } from "node:path";
import {
  isRemoteBrowseFolderName,
  normalizePosixAbs,
  RemoteOperationError,
  type RemoteDirEntry,
} from "../shared/remote";
import type { HostHandlerContext } from "./context";
import { requireRemoteRoot, resolveHostProjectPath } from "./project-path";

const HIDDEN_DIRECTORY_NAMES = new Set([
  ".git",
  ".prismnext",
  ".workbench",
  "node_modules",
  "__pycache__",
  "venv",
  "env",
]);

const HIDDEN_FILE_NAMES = new Set([".ds_store", "thumbs.db", ".git", ".prism-worktree-meta", ".brief.md"]);

const BLOB_LIMIT = 5 * 1024 * 1024;

function fileType(name: string): "tex" | "image" | "pdf" | "bib" | "style" | "other" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".tex")) return "tex";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".bib")) return "bib";
  if (/\.(png|jpe?g|gif|svg|bmp|webp)$/.test(lower)) return "image";
  if (/\.(sty|cls|bst|def|cfg|fd|dtx|ins|clo|ldf)$/.test(lower)) return "style";
  return "other";
}

function shouldSkipDir(name: string): boolean {
  return name.startsWith(".") || HIDDEN_DIRECTORY_NAMES.has(name);
}

async function walkMetadata(root: string, dir: string, prefix: string, files: unknown[], folders: string[]) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      folders.push(relativePath);
      await walkMetadata(root, abs, relativePath, files, folders);
      continue;
    }
    if (HIDDEN_FILE_NAMES.has(entry.name.toLowerCase())) continue;
    files.push({
      relativePath,
      absolutePath: abs,
      type: fileType(entry.name),
      fileSize: 0,
    });
  }
}

function resolveInRoot(ctx: HostHandlerContext, absPath: string): string {
  return resolveHostProjectPath(ctx, absPath);
}

export const fsHandlers: Record<string, (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>> = {
  /** Browse-time listing: no remoteRoot bind. Open Folder uses this before project.open. */
  async "fs:listDir"(params) {
    const path = normalizePosixAbs(String(params.path ?? ""));
    if (!path) {
      throw new RemoteOperationError("protocol", "listDir requires an absolute POSIX path.");
    }
    let st;
    try {
      st = await stat(path);
    } catch {
      throw new RemoteOperationError("protocol", `Directory not found: ${path}`);
    }
    if (!st.isDirectory()) {
      throw new RemoteOperationError("protocol", `Not a directory: ${path}`);
    }
    const names = await readdir(path, { withFileTypes: true });
    const entries: RemoteDirEntry[] = names
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => ({ name: entry.name, kind: "dir" as const }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const parent = path === "/" ? null : posix.dirname(path);
    return { path, parent: parent === path ? null : parent, entries };
  },

  /** Browse-time mkdir: no remoteRoot bind. New Project / Open Folder use this. */
  async "fs:mkdirDir"(params) {
    const path = normalizePosixAbs(String(params.path ?? ""));
    if (!path || path === "/") {
      throw new RemoteOperationError("protocol", "mkdirDir requires an absolute POSIX path.");
    }
    const name = posix.basename(path);
    if (!isRemoteBrowseFolderName(name)) {
      throw new RemoteOperationError("protocol", "Invalid folder name.");
    }
    try {
      await mkdir(path);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        throw new RemoteOperationError("protocol", "That folder already exists.");
      }
      throw err;
    }
    return { ok: true, path };
  },

  async "fs:scanMetadata"(params, ctx) {
    const root = resolveInRoot(ctx, String(params.rootPath ?? ctx.remoteRoot ?? ""));
    const files: unknown[] = [];
    const folders: string[] = [];
    await walkMetadata(root, root, "", files, folders);
    return { files, folders };
  },

  async "fs:scan"(params, ctx) {
    return fsHandlers["fs:scanMetadata"]!(params, ctx);
  },

  async "fs:read"(params, ctx) {
    const abs = resolveInRoot(ctx, String(params.absPath ?? ""));
    try {
      const content = await readFile(abs, "utf8");
      return { content };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { content: "", missing: true };
      throw err;
    }
  },

  async "fs:write"(params, ctx) {
    const abs = resolveInRoot(ctx, String(params.absPath ?? ""));
    mkdirSync(dirname(abs), { recursive: true });
    await writeFile(abs, String(params.content ?? ""), "utf8");
    return { ok: true };
  },

  async "fs:create"(params, ctx) {
    const root = requireRemoteRoot(ctx);
    const relative = String(params.relativePath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!relative || relative.split("/").includes("..")) {
      throw new RemoteOperationError("path_escaped", "Unsafe relative path.");
    }
    const abs = resolveInRoot(ctx, posix.join(root, relative));
    mkdirSync(dirname(abs), { recursive: true });
    await writeFile(abs, String(params.content ?? ""), "utf8");
    return { absPath: abs };
  },

  async "fs:delete"(params, ctx) {
    const abs = resolveInRoot(ctx, String(params.absPath ?? ""));
    await rm(abs, { force: true });
    return { ok: true };
  },

  async "fs:deleteFolder"(params, ctx) {
    const abs = resolveInRoot(ctx, String(params.absPath ?? ""));
    await rm(abs, { recursive: true, force: true });
    return { ok: true };
  },

  async "fs:mkdir"(params, ctx) {
    const abs = resolveInRoot(ctx, String(params.absPath ?? ""));
    await mkdir(abs, { recursive: true });
    return { ok: true };
  },

  async "fs:exists"(params, ctx) {
    try {
      const abs = resolveInRoot(ctx, String(params.absPath ?? ""));
      await stat(abs);
      return true;
    } catch {
      return false;
    }
  },

  async "fs:stat"(params, ctx) {
    try {
      const abs = resolveInRoot(ctx, String(params.absPath ?? ""));
      const st = await stat(abs);
      return {
        mtimeMs: st.mtimeMs,
        size: st.size,
        isFile: st.isFile(),
        isDirectory: st.isDirectory(),
      };
    } catch {
      return null;
    }
  },

  async "fs:isFile"(params, ctx) {
    const st = await fsHandlers["fs:stat"]!(params, ctx) as { isFile?: boolean } | null;
    return Boolean(st?.isFile);
  },

  async "fs:readBlob"(params, ctx) {
    const abs = resolveInRoot(ctx, String(params.path ?? params.absPath ?? ""));
    const offset = Number(params.offset ?? 0);
    const length = Math.min(Number(params.length ?? BLOB_LIMIT), BLOB_LIMIT);
    const handle = await import("node:fs/promises").then((m) => m.open(abs, "r"));
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buf, 0, length, offset);
      const st = await handle.stat();
      return {
        bytes: buf.subarray(0, bytesRead).toString("base64"),
        eof: offset + bytesRead >= st.size,
        size: st.size,
      };
    } finally {
      await handle.close();
    }
  },

  async "fs:rename"(params, ctx) {
    const oldPath = resolveInRoot(ctx, String(params.oldPath ?? ""));
    const newPath = resolveInRoot(ctx, String(params.newPath ?? ""));
    await rename(oldPath, newPath);
    return { ok: true };
  },

  async "fs:writeBlob"(params, ctx) {
    const abs = resolveInRoot(ctx, String(params.path ?? params.absPath ?? ""));
    const offset = Number(params.offset ?? 0);
    const bytes = Buffer.from(String(params.bytes ?? ""), "base64");
    mkdirSync(dirname(abs), { recursive: true });
    const flag = offset === 0 ? "w" : "r+";
    const handle = await import("node:fs/promises").then((m) => m.open(abs, flag));
    try {
      await handle.write(bytes, 0, bytes.length, offset);
    } finally {
      await handle.close();
    }
    return { ok: true, eof: Boolean(params.eof) };
  },

  // ─── Change watching ───
  // The Host process has no chokidar; `fs.watch` is not recursive on Linux.
  // A bounded-interval snapshot diff (relativePath → mtime:size) is portable
  // and cheap relative to the scan IPCs the laptop already issues.

  async "fs:watchStart"(params, ctx) {
    const root = ctx.remoteRoot ?? normalizePosixAbs(String(params.rootPath ?? ""));
    if (!root) {
      throw new RemoteOperationError("protocol", "watchStart requires a bound remoteRoot.");
    }
    // Returns only after the baseline snapshot is taken: once this resolves,
    // every poll reports real diffs (files present at start are baseline).
    await startHostWatch(root, ctx);
    return { ok: true, root };
  },

  async "fs:watchStop"() {
    stopHostWatch();
    return { ok: true };
  },
};

// ─── Host change watcher (snapshot diff → ctx.emit) ───

const HOST_WATCH_INTERVAL_MS = 3_000;
const HOST_WATCH_MAX_FILES = 50_000;

/** Test-only: shrink the poll interval (real timers in tests); null restores. */
export function _setHostWatchIntervalForTests(ms: number | null): void {
  hostWatchIntervalMs = ms ?? HOST_WATCH_INTERVAL_MS;
}

/** Test-only: hard-reset the watcher singleton between tests. */
export function _resetHostWatchForTests(): void {
  stopHostWatch();
}

/** Test-only: introspect the current watcher state. */
export function _getHostWatchStateForTests(): {
  root: string;
  timerArmed: boolean;
  scanning: boolean;
  snapshotSize: number;
  lastTickAt: number;
} | null {
  if (!hostWatch) return null;
  return {
    root: hostWatch.root,
    timerArmed: hostWatch.timer != null,
    scanning: hostWatch.scanning,
    snapshotSize: hostWatch.snapshot.size,
    lastTickAt: hostWatch.lastTickAt,
  };
}

let hostWatchIntervalMs = HOST_WATCH_INTERVAL_MS;

async function tick(state: HostWatchState): Promise<void> {
  if (!hostWatch || hostWatch !== state || state.scanning) return;
  state.scanning = true;
  try {
    const next = await snapshotRoot(state.root);
    const changed: string[] = [];
    for (const [rel, stamp] of next) {
      if (state.snapshot.get(rel) !== stamp) changed.push(posix.join(state.root, rel));
    }
    for (const rel of state.snapshot.keys()) {
      if (!next.has(rel)) changed.push(posix.join(state.root, rel));
    }
    state.snapshot = next;
    // The baseline tick (interval not yet armed) never emits.
    if (changed.length > 0 && state.timer) {
      state.ctx.emit("fs:fileChanged", {
        projectRoot: state.root,
        changedPaths: changed.slice(0, 500),
      });
    }
  } catch {
    // transient fs errors — the next tick retries
  } finally {
    state.scanning = false;
    state.lastTickAt = Date.now();
  }
}

interface HostWatchState {
  root: string;
  timer: ReturnType<typeof setInterval> | null;
  snapshot: Map<string, string>;
  scanning: boolean;
  ctx: HostHandlerContext;
  /** Date.now() of the last COMPLETED tick — diagnostics for stale loops. */
  lastTickAt: number;
}

let hostWatch: HostWatchState | null = null;

/** Capture `relativePath → "mtimeMs:size"` for the whole bound root. */
async function snapshotRoot(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  const walk = async (dir: string, prefix: string) => {
    if (snapshot.size > HOST_WATCH_MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // deleted mid-walk or unreadable — skip subtree
    }
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;
        await walk(abs, relativePath);
        continue;
      }
      if (HIDDEN_FILE_NAMES.has(entry.name.toLowerCase())) continue;
      try {
        const st = await stat(abs);
        snapshot.set(relativePath, `${st.mtimeMs}:${st.size}`);
      } catch {
        // raced deletion — omit; the next tick settles it
      }
    }
  };
  await walk(root, "");
  return snapshot;
}

async function startHostWatch(root: string, ctx: HostHandlerContext): Promise<void> {
  if (hostWatch && hostWatch.root === root) return;
  stopHostWatch();
  const state: HostWatchState = { root, timer: null, snapshot: new Map(), scanning: false, ctx, lastTickAt: 0 };
  hostWatch = state;
  // Baseline snapshot runs to completion BEFORE the interval is armed and
  // before watchStart resolves — pre-existing files are never reported.
  await tick(state);
  if (hostWatch !== state) return; // stopped while the baseline ran
  state.timer = setInterval(() => void tick(state), hostWatchIntervalMs);
}

function stopHostWatch(): void {
  const state = hostWatch;
  hostWatch = null;
  if (state?.timer) clearInterval(state.timer);
}
