import { ipcMain, dialog, BrowserWindow } from "electron";
import * as fs from "../services/filesystem";
import { startWatching, stopWatching } from "../services/filesystem";
import { createLogger } from "../services/logger";

const log = createLogger("template-ipc");

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

  const DEFAULT_MANUSCRIPT_DIR = "manuscript";
  const DEFAULT_MAIN_TEX = String.raw`\documentclass{article}

% ── Packages ──
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb,amsthm}
\usepackage{graphicx}
\usepackage[colorlinks=true,linkcolor=blue,citecolor=blue,urlcolor=blue]{hyperref}
\usepackage[
  style=nature,
  backend=bibtex,
  sorting=none,
]{biblatex}
\addbibresource{references.bib}

% ── Title ──
\title{Title}
\author{Author}
\date{\today}

\begin{document}

\maketitle

\begin{abstract}
  Write your abstract here.
\end{abstract}

\section{Introduction}

\section{Methods}

\section{Results}

\section{Discussion}

\printbibliography

\end{document}
`;

  ipcMain.handle("project:create", async (_event, args: { rootPath: string }) => {
    const { join } = require("node:path");
    const { writeFileSync } = require("node:fs");

    // Hidden .prismnext/ structure (always created)
    const prismDir = join(args.rootPath, ".prismnext");
    await fs.createDirectory(prismDir);
    await fs.createDirectory(join(prismDir, "sessions"));
    await fs.createDirectory(join(prismDir, "compile"));

    // Initial project settings
    writeFileSync(
      join(prismDir, "settings.json"),
      JSON.stringify(
        {
          version: 1,
          compiler: "tectonic",
          manuscript: { dir: DEFAULT_MANUSCRIPT_DIR, main: "main.tex" },
          workspaceDirs: [],
        },
        null,
        2,
      ),
    );
    writeFileSync(join(prismDir, "state.json"), JSON.stringify({}, null, 2));
    writeFileSync(join(prismDir, ".gitignore"), "compile/\nstate.json\n");

    // Manuscript directory + main.tex template
    const manuscriptPath = join(args.rootPath, DEFAULT_MANUSCRIPT_DIR);
    await fs.createDirectory(manuscriptPath);
    writeFileSync(join(manuscriptPath, "main.tex"), DEFAULT_MAIN_TEX);
  });

  ipcMain.handle("project:check", async (_event, args: { rootPath: string }) => {
    const { join } = require("node:path");
    const { existsSync } = require("node:fs");

    const PRISM_DIR = ".prismnext";
    const PRISM_FILES = ["settings.json", "state.json", ".gitignore"];
    const PRISM_SUBDIRS = ["sessions", "compile"];

    const missing: string[] = [];

    // Check .prismnext/ directory (only required structure)
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

  // ─── Template apply (with state tracking) ───

  ipcMain.handle(
    "template:apply",
    async (
      _event,
      args: {
        rootPath: string;
        manuscriptDir: string;
        files: { path: string; content: string }[];
        templateId: string;
        templateCategory: string;
      },
    ) => {
      const { join } = require("node:path");
      const { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } = require("node:fs");
      const { createHash } = require("node:crypto");

      const basePath = join(args.rootPath, args.manuscriptDir);
      const prismDir = join(args.rootPath, ".prismnext");
      const settingsPath = join(prismDir, "settings.json");

      // Read old template state to find orphaned files
      let oldAppliedFiles: Record<string, string> = {};
      let oldSettings: Record<string, unknown>;
      if (existsSync(settingsPath)) {
        const raw = readFileSync(settingsPath, "utf-8");
        try {
          oldSettings = JSON.parse(raw);
        } catch {
          // Settings file corrupted — don't lose it, write a backup and throw
          const backupPath = settingsPath + ".corrupted." + Date.now();
          writeFileSync(backupPath, raw, "utf-8");
          throw new Error(
            `Project settings file is corrupted. A backup was saved to ${backupPath}. ` +
            `Please restore your settings before switching templates.`
          );
        }
        const oldTemplate = oldSettings.template as Record<string, unknown> | undefined;
        oldAppliedFiles = (oldTemplate?.appliedFiles as Record<string, string>) || {};
      } else {
        oldSettings = {};
      }

      const newFilePaths = new Set(args.files.map((f) => f.path));

      // Remove files from old template that are NOT in the new template
      for (const oldPath of Object.keys(oldAppliedFiles)) {
        if (!newFilePaths.has(oldPath)) {
          const fullPath = join(basePath, oldPath);
          try {
            if (existsSync(fullPath)) unlinkSync(fullPath);
          } catch { /* best effort */ }
        }
      }

      // Write new template files
      const appliedFiles: Record<string, string> = {};
      try {
        for (const file of args.files) {
          const fullPath = join(basePath, file.path);
          const parent = join(fullPath, "..");
          mkdirSync(parent, { recursive: true });
          writeFileSync(fullPath, file.content, "utf-8");

          // Compute hash for change detection
          const hash = createHash("sha256").update(file.content).digest("hex");
          appliedFiles[file.path] = `sha256:${hash}`;
        }
      } catch (err) {
        // If writing fails, don't update settings — old settings still valid
        log.error("template:apply write failed", { error: String(err) });
        throw err;
      }

      // Update .prismnext/settings.json with template state
      oldSettings.template = {
        id: args.templateId,
        category: args.templateCategory,
        appliedAt: new Date().toISOString(),
        appliedFiles,
      };

      mkdirSync(prismDir, { recursive: true });
      writeFileSync(settingsPath, JSON.stringify(oldSettings, null, 2), "utf-8");

      log.info("template:apply", {
        rootPath: args.rootPath,
        templateId: args.templateId,
        count: args.files.length,
      });
      return { appliedFiles };
    },
  );

  // ─── Template listing ───

  ipcMain.handle("template:list", async () => {
    const { join } = require("node:path");
    const { readdirSync, readFileSync, existsSync } = require("node:fs");
    const { app } = require("electron");

    const templatesDir = app.isPackaged
      ? join(process.resourcesPath, "resources", "templates")
      : join(app.getAppPath(), "resources", "templates");

    if (!existsSync(templatesDir)) return [];

    const dirs = readdirSync(templatesDir, { withFileTypes: true })
      .filter((d: { isDirectory: () => boolean }) => d.isDirectory());

    const result = dirs.map((d: { name: string }) => {
      const manifestPath = join(templatesDir, d.name, "manifest.json");
      if (!existsSync(manifestPath)) return null;
      try {
        return JSON.parse(readFileSync(manifestPath, "utf-8"));
      } catch {
        return null;
      }
    }).filter(Boolean);

    log.info("template:list", { count: result.length });
    return result;
  });

  // ─── Template preview ───

  ipcMain.handle("template:preview", async (_event, args: { templateId: string }) => {
    const { join } = require("node:path");
    const { readFileSync, existsSync } = require("node:fs");
    const { app } = require("electron");

    const templatesDir = app.isPackaged
      ? join(process.resourcesPath, "resources", "templates")
      : join(app.getAppPath(), "resources", "templates");

    const pngPath = join(templatesDir, args.templateId, "preview.png");
    if (!existsSync(pngPath)) {
      log.info("template:preview — no preview.png", { templateId: args.templateId });
      return null;
    }

    try {
      const buffer = readFileSync(pngPath);
      log.info("template:preview", { templateId: args.templateId, sizeBytes: buffer.length });
      return `data:image/png;base64,${buffer.toString("base64")}`;
    } catch (err) {
      log.error("template:preview failed", { templateId: args.templateId, error: String(err) });
      return null;
    }
  });

  ipcMain.handle("template:get", async (_event, args: { templateId: string }) => {
    const { join } = require("node:path");
    const { readFileSync, readdirSync, existsSync, statSync } = require("node:fs");
    const { app } = require("electron");

    const templatesDir = app.isPackaged
      ? join(process.resourcesPath, "resources", "templates")
      : join(app.getAppPath(), "resources", "templates");

    const templateDir = join(templatesDir, args.templateId);
    const manifestPath = join(templateDir, "manifest.json");
    if (!existsSync(manifestPath)) return null;

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const filesDir = join(templateDir, "files");

    // Recursively read all files
    const readFiles = (dir: string, prefix = ""): { path: string; content: string }[] => {
      const results: { path: string; content: string }[] = [];
      if (!existsSync(dir)) return results;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          results.push(...readFiles(fullPath, relativePath));
        } else {
          results.push({ path: relativePath, content: readFileSync(fullPath, "utf-8") });
        }
      }
      return results;
    };

    const files = readFiles(filesDir);
    log.info("template:get", { templateId: args.templateId, fileCount: files.length });
    return { ...manifest, files };
  });

  // ─── Template PDF ───

  ipcMain.handle("template:getPdfData", async (_event, args: { templateId: string }) => {
    const { join } = require("node:path");
    const { readFileSync, existsSync } = require("node:fs");
    const { app } = require("electron");

    const templatesDir = app.isPackaged
      ? join(process.resourcesPath, "resources", "templates")
      : join(app.getAppPath(), "resources", "templates");

    const pdfPath = join(templatesDir, args.templateId, "preview.pdf");
    if (!existsSync(pdfPath)) {
      log.info("template:getPdfData — no preview.pdf", { templateId: args.templateId });
      return null;
    }

    try {
      const buffer = readFileSync(pdfPath);
      log.info("template:getPdfData", { templateId: args.templateId, sizeBytes: buffer.length });
      return `data:application/pdf;base64,${buffer.toString("base64")}`;
    } catch (err) {
      log.error("template:getPdfData failed", { templateId: args.templateId, error: String(err) });
      return null;
    }
  });

  // ─── Template change detection ───

  ipcMain.handle(
    "template:detectChanges",
    async (
      _event,
      args: {
        rootPath: string;
        manuscriptDir: string;
        appliedFiles: Record<string, string>;
      },
    ) => {
      const { join } = require("node:path");
      const { readFileSync, existsSync } = require("node:fs");
      const { createHash } = require("node:crypto");

      const basePath = join(args.rootPath, args.manuscriptDir);
      const changed: string[] = [];
      const deleted: string[] = [];
      const unchanged: string[] = [];

      for (const [relativePath, originalHash] of Object.entries(args.appliedFiles)) {
        const fullPath = join(basePath, relativePath);
        if (!existsSync(fullPath)) {
          deleted.push(relativePath);
          continue;
        }
        try {
          const content = readFileSync(fullPath);
          const currentHash = createHash("sha256").update(content).digest("hex");
          const fullCurrentHash = `sha256:${currentHash}`;
          if (fullCurrentHash === originalHash) {
            unchanged.push(relativePath);
          } else {
            changed.push(relativePath);
          }
        } catch {
          changed.push(relativePath);
        }
      }

      log.info("template:detectChanges", {
        changed: changed.length,
        deleted: deleted.length,
        unchanged: unchanged.length,
      });
      return { changed, deleted, unchanged };
    },
  );

  // ─── Template backup ───

  ipcMain.handle(
    "template:backup",
    async (
      _event,
      args: {
        rootPath: string;
        manuscriptDir: string;
        files: string[];
        backupLabel: string;
      },
    ) => {
      const { join } = require("node:path");
      const { copyFileSync, mkdirSync, writeFileSync, existsSync, rmSync } = require("node:fs");

      const basePath = join(args.rootPath, args.manuscriptDir);
      const backupsDir = join(args.rootPath, ".prismnext", "backups");
      const backupDir = join(backupsDir, args.backupLabel);

      if (!existsSync(backupsDir)) {
        mkdirSync(backupsDir, { recursive: true });
      }

      // Handle duplicate labels by appending a counter
      let actualBackupDir = backupDir;
      let actualLabel = args.backupLabel;
      if (existsSync(actualBackupDir)) {
        let counter = 1;
        while (existsSync(join(backupsDir, `${args.backupLabel}_${counter}`))) {
          counter++;
        }
        actualLabel = `${args.backupLabel}_${counter}`;
        actualBackupDir = join(backupsDir, actualLabel);
      }
      mkdirSync(actualBackupDir, { recursive: true });

      const copied: string[] = [];
      try {
        for (const relativePath of args.files) {
          const srcPath = join(basePath, relativePath);
          const destPath = join(actualBackupDir, relativePath);
          if (!existsSync(srcPath)) continue;
          const parent = join(destPath, "..");
          mkdirSync(parent, { recursive: true });
          copyFileSync(srcPath, destPath);
          copied.push(relativePath);
        }

        // Write manifest
        const manifest = {
          backupLabel: actualLabel,
          timestamp: new Date().toISOString(),
          files: copied,
        };
        writeFileSync(join(actualBackupDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
      } catch (err) {
        // Clean up partial backup
        try { rmSync(actualBackupDir, { recursive: true, force: true }); } catch {}
        throw err;
      }

      log.info("template:backup", { backupDir: actualBackupDir, fileCount: copied.length });
      return { backupPath: actualBackupDir };
    },
  );

  // ─── Template backup listing ───

  ipcMain.handle(
    "template:listBackups",
    async (
      _event,
      args: { rootPath: string },
    ) => {
      const { join } = require("node:path");
      const { readdirSync, readFileSync, existsSync, statSync } = require("node:fs");

      const backupsDir = join(args.rootPath, ".prismnext", "backups");
      if (!existsSync(backupsDir)) return [];

      const entries = readdirSync(backupsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => {
          const manifestPath = join(backupsDir, d.name, "manifest.json");
          let manifest: { backupLabel?: string; timestamp?: string; files?: string[] } = {};
          if (existsSync(manifestPath)) {
            try {
              manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
            } catch { /* ignore */ }
          }
          return {
            label: d.name,
            timestamp: manifest.timestamp || "",
            files: manifest.files || [],
          };
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // newest first

      log.info("template:listBackups", { count: entries.length });
      return entries;
    },
  );

  // ─── Template backup restore ───

  ipcMain.handle(
    "template:restoreBackup",
    async (
      _event,
      args: {
        rootPath: string;
        manuscriptDir: string;
        backupLabel: string;
      },
    ) => {
      const { join } = require("node:path");
      const { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } = require("node:fs");

      const backupsDir = join(args.rootPath, ".prismnext", "backups");
      const backupDir = join(backupsDir, args.backupLabel);
      const manifestPath = join(backupDir, "manifest.json");

      if (!existsSync(manifestPath)) {
        throw new Error(`Backup not found: ${args.backupLabel}`);
      }

      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const manifestFiles: string[] = Array.isArray(manifest.files) ? manifest.files : [];
      if (manifestFiles.length === 0) {
        throw new Error(`Backup manifest is empty or invalid: ${args.backupLabel}`);
      }

      const basePath = join(args.rootPath, args.manuscriptDir);

      // Read current settings to find stale files to remove
      const prismDir = join(args.rootPath, ".prismnext");
      const settingsPath = join(prismDir, "settings.json");
      let currentAppliedFiles: Record<string, string> = {};
      let settings: Record<string, unknown> = {};
      if (existsSync(settingsPath)) {
        try {
          settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
          const tmpl = settings.template as Record<string, unknown> | undefined;
          currentAppliedFiles = (tmpl?.appliedFiles as Record<string, string>) || {};
        } catch { /* ignore */ }
      }

      const backupFileSet = new Set(manifestFiles);

      // Remove files that exist in current manuscript but NOT in the backup
      for (const oldPath of Object.keys(currentAppliedFiles)) {
        if (!backupFileSet.has(oldPath)) {
          const fullPath = join(basePath, oldPath);
          try {
            if (existsSync(fullPath)) unlinkSync(fullPath);
          } catch { /* best effort */ }
        }
      }

      // Restore backup files
      const restored: string[] = [];
      const { createHash } = require("node:crypto");
      const newAppliedFiles: Record<string, string> = {};

      try {
        for (const relativePath of manifestFiles) {
          const srcPath = join(backupDir, relativePath);
          const destPath = join(basePath, relativePath);
          if (!existsSync(srcPath)) continue;
          const parent = join(destPath, "..");
          mkdirSync(parent, { recursive: true });
          copyFileSync(srcPath, destPath);
          restored.push(relativePath);

          // Compute hash of restored file for future change detection
          try {
            const content = readFileSync(destPath);
            const hash = createHash("sha256").update(content).digest("hex");
            newAppliedFiles[relativePath] = `sha256:${hash}`;
          } catch { /* skip */ }
        }
      } catch (err) {
        log.error("template:restoreBackup failed mid-operation", {
          error: String(err),
          restored,
          remaining: manifestFiles.filter(f => !restored.includes(f)),
        });
        throw err;
      }

      // Update settings.json with restored file hashes
      if (!settings.template) {
        settings.template = {};
      }
      (settings.template as Record<string, unknown>).appliedFiles = newAppliedFiles;
      (settings.template as Record<string, unknown>).appliedAt = new Date().toISOString();
      mkdirSync(prismDir, { recursive: true });
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");

      log.info("template:restoreBackup", { backupLabel: args.backupLabel, restored: restored.length });
      return { restored };
    },
  );

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
