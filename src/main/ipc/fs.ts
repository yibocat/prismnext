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

export function registerFsHandlers(
  watcher: Pick<typeof fs, "startWatching" | "stopWatching"> = fs,
  authority: ProjectLifecycleAuthority = projectLifecycleAuthority,
): void {
  ipcMain.handle("fs:scan", async (_event, args: { rootPath: string }) => {
    return fs.scanProjectFolder(args.rootPath);
  });

  ipcMain.handle("fs:scanMetadata", async (_event, args: { rootPath: string }) => {
    return fs.scanMetadata(args.rootPath);
  });

  ipcMain.handle("fs:read", async (_event, args: { absPath: string }) => {
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
    assertUnderHome(args.absPath, "fs:readBytes");
    const bytes = await fs.readFileBytes(args.absPath);
    // Structured clone: return a plain ArrayBuffer for the renderer.
    return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  });

  ipcMain.handle(
    "fs:write",
    async (_event, args: { absPath: string; content: string }) => {
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
    assertContained(args.absPath, "fs:delete");
    await fs.deleteFileFromDisk(args.absPath);
    const { scheduleSkillsRefreshFromAgentPath } = await import("../skills/project-skills-refresh");
    scheduleSkillsRefreshFromAgentPath(args.absPath);
  });

  ipcMain.handle(
    "fs:deleteFolder",
    async (_event, args: { absPath: string }) => {
      assertContained(args.absPath, "fs:deleteFolder");
      await fs.deleteFolderFromDisk(args.absPath);
      const { scheduleSkillsRefreshFromAgentPath } = await import("../skills/project-skills-refresh");
      scheduleSkillsRefreshFromAgentPath(args.absPath);
    },
  );

  ipcMain.handle(
    "fs:rename",
    async (_event, args: { oldPath: string; newPath: string }) => {
      assertContained(args.oldPath, "fs:rename");
      assertContained(args.newPath, "fs:rename");
      await fs.renameFileOnDisk(args.oldPath, args.newPath);
      const { scheduleSkillsRefreshFromAgentPath } = await import("../skills/project-skills-refresh");
      scheduleSkillsRefreshFromAgentPath(args.oldPath);
      scheduleSkillsRefreshFromAgentPath(args.newPath);
    },
  );

  ipcMain.handle("fs:mkdir", async (_event, args: { absPath: string }) => {
    assertContained(args.absPath, "fs:mkdir");
    await fs.createDirectory(args.absPath);
  });

  // ─── File watcher ───

  ipcMain.handle("fs:watch-start", async () => {
    const rootPath = authority.currentRoot;
    if (!rootPath) {
      throw new Error("Cannot watch an unopened project");
    }
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
    if (!isPathUnderHome(args.absPath)) return false;
    const { existsSync } = require("node:fs");
    return existsSync(args.absPath);
  });

  ipcMain.handle("fs:isFile", async (_event, args: { absPath: string }) => {
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
