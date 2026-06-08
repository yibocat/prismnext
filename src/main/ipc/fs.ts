import { ipcMain, dialog, BrowserWindow } from "electron";
import * as fs from "../services/filesystem";
import { startWatching, stopWatching } from "../services/filesystem";

export function registerFsHandlers(): void {
  ipcMain.handle("fs:scan", async (_event, args: { rootPath: string }) => {
    return fs.scanProjectFolder(args.rootPath);
  });

  ipcMain.handle("fs:scanMetadata", async (_event, args: { rootPath: string }) => {
    return fs.scanMetadata(args.rootPath);
  });

  ipcMain.handle("fs:read", async (_event, args: { absPath: string }) => {
    const content = await fs.readTexFileContent(args.absPath);
    return { content };
  });

  /** Batch-read multiple text files in a single IPC round-trip.
   *  Returns a map of absolute-path → content for all successfully read files. */
  ipcMain.handle("fs:readBatch", async (_event, args: { absPaths: string[] }) => {
    const results: Record<string, string> = {};
    await Promise.all(
      args.absPaths.map(async (absPath) => {
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
    const dataUrl = await fs.readImageAsDataUrl(args.absPath);
    return { dataUrl };
  });

  ipcMain.handle(
    "fs:write",
    async (_event, args: { absPath: string; content: string }) => {
      await fs.writeTexFileContent(args.absPath, args.content);
    },
  );

  ipcMain.handle(
    "fs:create",
    async (
      _event,
      args: { rootPath: string; relativePath: string; content: string },
    ) => {
      const absPath = await fs.createFileOnDisk(
        args.rootPath,
        args.relativePath,
        args.content,
      );
      return { absPath };
    },
  );

  ipcMain.handle("fs:delete", async (_event, args: { absPath: string }) => {
    await fs.deleteFileFromDisk(args.absPath);
  });

  ipcMain.handle(
    "fs:deleteFolder",
    async (_event, args: { absPath: string }) => {
      await fs.deleteFolderFromDisk(args.absPath);
    },
  );

  ipcMain.handle(
    "fs:rename",
    async (_event, args: { oldPath: string; newPath: string }) => {
      await fs.renameFileOnDisk(args.oldPath, args.newPath);
    },
  );

  ipcMain.handle("fs:mkdir", async (_event, args: { absPath: string }) => {
    await fs.createDirectory(args.absPath);
  });

  // ─── File watcher ───

  ipcMain.handle("fs:watch-start", async (_event, args: { rootPath: string }) => {
    await startWatching(args.rootPath);
  });

  ipcMain.handle("fs:watch-stop", async () => {
    await stopWatching();
  });

  // ─── Dialog ───

  ipcMain.handle("dialog:openFolder", async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) {
      return { canceled: true, path: null };
    }

    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Open Project Folder",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null };
    }

    return { canceled: false, path: result.filePaths[0] };
  });

  // ─── Path check ───

  ipcMain.handle("fs:exists", async (_event, args: { absPath: string }) => {
    const { existsSync } = require("node:fs");
    return existsSync(args.absPath);
  });

  // ─── Project creation ───

  const PROJECT_DIRS = ["manuscript", "vault", "code", "assets", "zotero", "other"];

  ipcMain.handle("project:create", async (_event, args: { rootPath: string }) => {
    const { join } = require("node:path");
    const { writeFileSync } = require("node:fs");

    // Visible mode directories
    for (const dir of PROJECT_DIRS) {
      await fs.createDirectory(join(args.rootPath, dir));
    }

    // Hidden .prismnext/ structure
    const prismDir = join(args.rootPath, ".prismnext");
    await fs.createDirectory(prismDir);
    await fs.createDirectory(join(prismDir, "sessions"));
    await fs.createDirectory(join(prismDir, "compile"));

    // Initial files
    writeFileSync(join(prismDir, "settings.json"), JSON.stringify({ version: 1, compiler: "tectonic" }, null, 2));
    writeFileSync(join(prismDir, "state.json"), JSON.stringify({}, null, 2));
    writeFileSync(join(prismDir, ".gitignore"), "compile/\nstate.json\n");
  });

  ipcMain.handle("project:check", async (_event, args: { rootPath: string }) => {
    const { join } = require("node:path");
    const { existsSync } = require("node:fs");

    const PRISM_DIR = ".prismnext";
    const PRISM_FILES = ["settings.json", "state.json", ".gitignore"];
    const PRISM_SUBDIRS = ["sessions", "compile"];

    const missing: string[] = [];

    // Check visible mode directories
    for (const dir of PROJECT_DIRS) {
      if (!existsSync(join(args.rootPath, dir))) missing.push(dir);
    }

    // Check .prismnext/ directory
    const prismPath = join(args.rootPath, PRISM_DIR);
    if (!existsSync(prismPath)) {
      missing.push(`${PRISM_DIR}/`);
    } else {
      // Check internal files
      for (const f of PRISM_FILES) {
        if (!existsSync(join(prismPath, f))) missing.push(`${PRISM_DIR}/${f}`);
      }
      // Check internal subdirectories
      for (const d of PRISM_SUBDIRS) {
        if (!existsSync(join(prismPath, d))) missing.push(`${PRISM_DIR}/${d}/`);
      }
    }

    return { missing };
  });

  // ─── Window ───

  ipcMain.handle(
    "window:setTitle",
    (event, args: { title: string }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.setTitle(args.title);
      }
    },
  );
}
