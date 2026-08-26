import { ipcMain } from "electron";
import * as fs from "../project/filesystem";
import { findProjectRelByBasename } from "../lib/find-project-file";
import { assertSafeRelativePath } from "../lib/template-path";
import {
  isPathUnderHome,
  assertContained,
  assertUnderHome,
} from "../project/active-project-roots";
import {
  projectLifecycleAuthority,
  type ProjectLifecycleAuthority,
} from "../project/project-lifecycle-authority";
import { isRemoteProjectRoot, parseRemoteAbs, RemoteOperationError } from "../../shared/remote";
import { disconnectedHostFsProbe, encodeRemoteAbs, encodeRemoteScan, firstRemoteAbs, hostFsNeedsProjectBind, toHostFsParams } from "../remote/fs-bridge";
import { getRemoteSessionBroker } from "./remote";

const BLOB_CHUNK = 4 * 1024 * 1024;

function imageMime(absPath: string): string {
  const lower = absPath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "application/octet-stream";
}

async function readRemoteBlobs(profileId: string, absPath: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let offset = 0;
  for (;;) {
    const raw = await getRemoteSessionBroker().invoke(profileId, "fs:readBlob", {
      path: absPath,
      offset,
      length: BLOB_CHUNK,
    }) as { bytes?: string; eof?: boolean };
    chunks.push(Buffer.from(String(raw.bytes ?? ""), "base64"));
    if (raw.eof || !raw.bytes) break;
    offset += BLOB_CHUNK;
  }
  return Buffer.concat(chunks);
}

async function invokeHostFs(method: string, args: Record<string, unknown>): Promise<
  { profileId: string; result: unknown } | null
> {
  const remote = firstRemoteAbs(
    typeof args.rootPath === "string" ? args.rootPath : null,
    typeof args.absPath === "string" ? args.absPath : null,
    typeof args.oldPath === "string" ? args.oldPath : null,
    typeof args.projectRoot === "string" ? args.projectRoot : null,
    typeof args.path === "string" ? args.path : null,
  );
  if (!remote) return null;
  const broker = getRemoteSessionBroker();
  if (!broker.isBound(remote.profileId)) {
    const probe = disconnectedHostFsProbe(method);
    if (probe !== null) return { profileId: remote.profileId, result: probe };
    throw new RemoteOperationError("not_connected", "Not connected.");
  }
  if (hostFsNeedsProjectBind(method)) {
    const root = typeof args.rootPath === "string" ? parseRemoteAbs(args.rootPath) : null;
    if (root) {
      await broker.ensureProjectOpen(root.profileId, root.abs);
    }
  }
  const result = await broker.invoke(
    remote.profileId,
    method,
    toHostFsParams(args),
  );
  return { profileId: remote.profileId, result };
}

export function registerFsHandlers(
  watcher: Pick<typeof fs, "startWatching" | "stopWatching"> = fs,
  authority: ProjectLifecycleAuthority = projectLifecycleAuthority,
): void {
  ipcMain.handle("fs:scan", async (_event, args: { rootPath: string }) => {
    const remote = await invokeHostFs("fs:scan", args);
    if (remote) return encodeRemoteScan(remote.profileId, remote.result as { files: Array<{ absolutePath: string }>; folders: string[] });
    return fs.scanProjectFolder(args.rootPath);
  });

  ipcMain.handle("fs:scanMetadata", async (_event, args: { rootPath: string }) => {
    const remote = await invokeHostFs("fs:scanMetadata", args);
    if (remote) return encodeRemoteScan(remote.profileId, remote.result as { files: Array<{ absolutePath: string }>; folders: string[] });
    return fs.scanMetadata(args.rootPath);
  });

  ipcMain.handle("fs:read", async (_event, args: { absPath: string }) => {
    const remote = await invokeHostFs("fs:read", args);
    if (remote) return remote.result;
    assertUnderHome(args.absPath, "fs:read");
    try {
      const content = await fs.readTexFileContent(args.absPath);
      return { content };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") {
        return { content: "", missing: true };
      }
      throw err;
    }
  });

  /** Batch-read multiple text files in a single IPC round-trip.
   *  Returns a map of absolute-path → content for all successfully read files. */
  ipcMain.handle("fs:readBatch", async (_event, args: { absPaths: string[] }) => {
    const results: Record<string, string> = {};
    await Promise.all(
      args.absPaths.map(async (absPath) => {
        const remote = firstRemoteAbs(absPath);
        if (remote) {
          try {
            const read = await getRemoteSessionBroker().invoke(
              remote.profileId,
              "fs:read",
              { absPath: remote.abs },
            ) as { content?: string };
            if (typeof read.content === "string") results[absPath] = read.content;
          } catch {
            // Skip files that can't be read
          }
          return;
        }
        if (!isPathUnderHome(absPath)) return; // skip paths outside home (security)
        try {
          results[absPath] = await fs.readTexFileContent(absPath);
        } catch {
          // Skip files that can't be read
        }
      }),
    );
    return { results };
  });

  ipcMain.handle("fs:readImage", async (_event, args: { absPath: string }) => {
    const remote = firstRemoteAbs(args.absPath);
    if (remote) {
      const bytes = await readRemoteBlobs(remote.profileId, remote.abs);
      return {
        dataUrl: `data:${imageMime(remote.abs)};base64,${bytes.toString("base64")}`,
        mtimeMs: null as number | null,
      };
    }
    assertUnderHome(args.absPath, "fs:readImage");
    const { existsSync } = require("node:fs");
    if (!existsSync(args.absPath)) {
      return { dataUrl: null as string | null, mtimeMs: null as number | null };
    }
    try {
      const { dataUrl, mtimeMs } = await fs.readImageAsDataUrlWithMeta(args.absPath);
      return { dataUrl, mtimeMs };
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as NodeJS.ErrnoException).code
          : undefined;
      if (code === "ENOENT") {
        return { dataUrl: null as string | null, mtimeMs: null as number | null };
      }
      throw err;
    }
  });

  ipcMain.handle("fs:stat", async (_event, args: { absPath: string }) => {
    const remote = await invokeHostFs("fs:stat", args);
    if (remote) return remote.result;
    if (!isPathUnderHome(args.absPath)) return null;
    const { existsSync, statSync } = require("node:fs");
    try {
      if (!existsSync(args.absPath)) return null;
      const st = statSync(args.absPath);
      return {
        mtimeMs: st.mtimeMs,
        size: st.size,
        isFile: st.isFile(),
        isDirectory: st.isDirectory(),
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle("fs:readBytes", async (_event, args: { absPath: string }) => {
    if (firstRemoteAbs(args.absPath)) {
      const remote = firstRemoteAbs(args.absPath)!;
      const bytes = await readRemoteBlobs(remote.profileId, remote.abs);
      return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    }
    assertUnderHome(args.absPath, "fs:readBytes");
    const bytes = await fs.readFileBytes(args.absPath);
    // Structured clone: return a plain ArrayBuffer for the renderer.
    return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  });

  ipcMain.handle(
    "fs:write",
    async (_event, args: { absPath: string; content: string }) => {
      const remote = await invokeHostFs("fs:write", args);
      if (remote) return remote.result;
      assertContained(args.absPath, "fs:write");
      await fs.writeTexFileContent(args.absPath, args.content);
      const { scheduleSkillsRefreshFromAgentPath } = await import("../skills/project-skills-refresh");
      scheduleSkillsRefreshFromAgentPath(args.absPath);
    },
  );

  ipcMain.handle(
    "fs:create",
    async (
      _event,
      args: { rootPath: string; relativePath: string; content: string },
    ) => {
      const remote = await invokeHostFs("fs:create", args);
      if (remote) {
        const created = remote.result as { absPath?: string };
        return {
          absPath: created.absPath
            ? encodeRemoteAbs(remote.profileId, created.absPath) ?? created.absPath
            : created.absPath,
        };
      }
      assertSafeRelativePath(args.relativePath);
      assertContained(args.rootPath, "fs:create");
      const absPath = await fs.createFileOnDisk(
        args.rootPath,
        args.relativePath,
        args.content,
      );
      const { scheduleSkillsRefreshFromAgentPath } = await import("../skills/project-skills-refresh");
      scheduleSkillsRefreshFromAgentPath(absPath);
      return { absPath };
    },
  );

  ipcMain.handle("fs:delete", async (_event, args: { absPath: string }) => {
    const remote = await invokeHostFs("fs:delete", args);
    if (remote) return remote.result;
    assertContained(args.absPath, "fs:delete");
    await fs.deleteFileFromDisk(args.absPath);
    const { scheduleSkillsRefreshFromAgentPath } = await import("../skills/project-skills-refresh");
    scheduleSkillsRefreshFromAgentPath(args.absPath);
  });

  ipcMain.handle(
    "fs:deleteFolder",
    async (_event, args: { absPath: string }) => {
      const remote = await invokeHostFs("fs:deleteFolder", args);
      if (remote) return remote.result;
      assertContained(args.absPath, "fs:deleteFolder");
      await fs.deleteFolderFromDisk(args.absPath);
      const { scheduleSkillsRefreshFromAgentPath } = await import("../skills/project-skills-refresh");
      scheduleSkillsRefreshFromAgentPath(args.absPath);
    },
  );

  ipcMain.handle(
    "fs:rename",
    async (_event, args: { oldPath: string; newPath: string }) => {
      const oldRemote = parseRemoteAbs(args.oldPath);
      const newRemote = parseRemoteAbs(args.newPath);
      if (oldRemote || newRemote) {
        if (!oldRemote || !newRemote || oldRemote.profileId !== newRemote.profileId) {
          throw new Error("Rename must stay on the same remote host.");
        }
        return getRemoteSessionBroker().invoke(
          oldRemote.profileId,
          "fs:rename",
          toHostFsParams(args),
        );
      }
      assertContained(args.oldPath, "fs:rename");
      assertContained(args.newPath, "fs:rename");
      await fs.renameFileOnDisk(args.oldPath, args.newPath);
      const { scheduleSkillsRefreshFromAgentPath } = await import("../skills/project-skills-refresh");
      scheduleSkillsRefreshFromAgentPath(args.oldPath);
      scheduleSkillsRefreshFromAgentPath(args.newPath);
    },
  );

  ipcMain.handle("fs:mkdir", async (_event, args: { absPath: string }) => {
    const remote = await invokeHostFs("fs:mkdir", args);
    if (remote) return remote.result;
    assertContained(args.absPath, "fs:mkdir");
    await fs.createDirectory(args.absPath);
  });

  // ─── File watcher ───

  ipcMain.handle("fs:watch-start", async () => {
    const rootPath = authority.currentRoot;
    if (!rootPath) {
      throw new Error("Cannot watch an unopened project");
    }
    if (isRemoteProjectRoot(rootPath)) return;
    await watcher.startWatching(rootPath);
    if (authority.currentRoot !== rootPath) {
      throw new Error("Cannot watch an unopened project");
    }
  });

  ipcMain.handle("fs:watch-stop", async () => {
    await watcher.stopWatching();
  });

  // ─── Path check ───

  ipcMain.handle("fs:exists", async (_event, args: { absPath: string }) => {
    const remote = await invokeHostFs("fs:exists", args);
    if (remote) return remote.result;
    if (!isPathUnderHome(args.absPath)) return false;
    const { existsSync } = require("node:fs");
    return existsSync(args.absPath);
  });

  ipcMain.handle("fs:isFile", async (_event, args: { absPath: string }) => {
    const remote = await invokeHostFs("fs:isFile", args);
    if (remote) return remote.result;
    if (!isPathUnderHome(args.absPath)) return false;
    const { existsSync, statSync } = require("node:fs");
    try {
      return existsSync(args.absPath) && statSync(args.absPath).isFile();
    } catch {
      return false;
    }
  });

  ipcMain.handle(
    "fs:findByBasename",
    async (_event, args: { projectRoot: string; basename: string }) => {
      if (!args.projectRoot || !isPathUnderHome(args.projectRoot)) return null;
      const base = typeof args.basename === "string" ? args.basename : "";
      if (!base.trim()) return null;
      return findProjectRelByBasename(args.projectRoot, base);
    },
  );
}
