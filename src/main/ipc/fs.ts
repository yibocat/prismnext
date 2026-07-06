import { ipcMain, dialog, BrowserWindow } from "electron";
import * as fs from "../services/filesystem";
import { startWatching, stopWatching } from "../services/filesystem";
import { buildAgentsMdScaffold } from "../services/agents-md-scaffold";
import { createLogger } from "../services/logger";
import type { WorkspaceFolder } from "../../renderer/types/workspace";
import { writeWorkspaceDirs, createConfiguredFolders, validateWorkspaceDirs } from "../services/workspace-config";
import type { Dirent } from "node:fs";
import {
  assertSafeRelativePath,
  assertSafeRelativePaths,
  parseBackupLabelIds,
} from "../lib/template-path";
import {
  registerProjectRoot,
  clearRoots,
  isPathUnderHome,
  assertContained,
  assertUnderHome,
} from "../services/active-project-roots";

const log = createLogger("template-ipc");

export function registerFsHandlers(): void {
  ipcMain.handle("fs:scan", async (_event, args: { rootPath: string }) => {
    registerProjectRoot(args.rootPath); // best-effort: register active project root for path containment
    return fs.scanProjectFolder(args.rootPath);
  });

  ipcMain.handle("fs:scanMetadata", async (_event, args: { rootPath: string }) => {
    registerProjectRoot(args.rootPath);
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
    const dataUrl = await fs.readImageAsDataUrl(args.absPath);
    return { dataUrl };
  });

  ipcMain.handle(
    "fs:write",
    async (_event, args: { absPath: string; content: string }) => {
      assertContained(args.absPath, "fs:write");
      await fs.writeTexFileContent(args.absPath, args.content);
      const { scheduleSkillsRefreshFromAgentPath } = await import("../services/project-skills-refresh");
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
      const { scheduleSkillsRefreshFromAgentPath } = await import("../services/project-skills-refresh");
      scheduleSkillsRefreshFromAgentPath(absPath);
      return { absPath };
    },
  );

  ipcMain.handle("fs:delete", async (_event, args: { absPath: string }) => {
    assertContained(args.absPath, "fs:delete");
    await fs.deleteFileFromDisk(args.absPath);
    const { scheduleSkillsRefreshFromAgentPath } = await import("../services/project-skills-refresh");
    scheduleSkillsRefreshFromAgentPath(args.absPath);
  });

  ipcMain.handle(
    "fs:deleteFolder",
    async (_event, args: { absPath: string }) => {
      assertContained(args.absPath, "fs:deleteFolder");
      await fs.deleteFolderFromDisk(args.absPath);
      const { scheduleSkillsRefreshFromAgentPath } = await import("../services/project-skills-refresh");
      scheduleSkillsRefreshFromAgentPath(args.absPath);
    },
  );

  ipcMain.handle(
    "fs:rename",
    async (_event, args: { oldPath: string; newPath: string }) => {
      assertContained(args.oldPath, "fs:rename");
      assertContained(args.newPath, "fs:rename");
      await fs.renameFileOnDisk(args.oldPath, args.newPath);
      const { scheduleSkillsRefreshFromAgentPath } = await import("../services/project-skills-refresh");
      scheduleSkillsRefreshFromAgentPath(args.oldPath);
      scheduleSkillsRefreshFromAgentPath(args.newPath);
    },
  );

  ipcMain.handle("fs:mkdir", async (_event, args: { absPath: string }) => {
    assertContained(args.absPath, "fs:mkdir");
    await fs.createDirectory(args.absPath);
  });

  // ─── File watcher ───

  ipcMain.handle("fs:watch-start", async (_event, args: { rootPath: string }) => {
    // Project switch: reset path-containment roots to the newly opened project.
    clearRoots();
    registerProjectRoot(args.rootPath);
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

  ipcMain.handle("dialog:openFile", async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) {
      return { canceled: true, paths: [] as string[] };
    }

    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile", "multiSelections"],
      title: "Open File",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, paths: [] as string[] };
    }

    return { canceled: false, paths: result.filePaths };
  });

  ipcMain.handle(
    "dialog:openJsonFile",
    async () => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) {
        return { canceled: true, path: null as string | null };
      }

      const result = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        title: "Import commands",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: null };
      }

      return { canceled: false, path: result.filePaths[0] };
    },
  );

  ipcMain.handle(
    "dialog:saveJsonFile",
    async (_event, args: { defaultPath?: string }) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) {
        return { canceled: true, path: null as string | null };
      }

      const result = await dialog.showSaveDialog(win, {
        title: "Export commands",
        defaultPath: args.defaultPath ?? "prismnext-commands.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true, path: null };
      }

      return { canceled: false, path: result.filePath };
    },
  );

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

  // ─── Project creation ───

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

  async function createAgentConfig(prismDir: string): Promise<void> {
    const { join } = require("node:path");
    const { existsSync, mkdirSync, writeFileSync, renameSync, rmSync } = require("node:fs");

    const newAgentDir = join(prismDir, "agent");
    const oldAgentDir = join(prismDir, "agent-config", "opencode");

    // Migration: rename old .prismnext/agent-config/opencode/ → .prismnext/agent/
    if (existsSync(oldAgentDir) && !existsSync(newAgentDir)) {
      try {
        renameSync(oldAgentDir, newAgentDir);
        // Remove settings.json (permissions belong to app-level OpenCode config)
        const oldSettings = join(newAgentDir, "settings.json");
        if (existsSync(oldSettings)) rmSync(oldSettings);
        // Clean up empty agent-config/ parent if empty
        const agentConfigDir = join(prismDir, "agent-config");
        try { rmSync(agentConfigDir, { recursive: true }); } catch { /* not empty, leave it */ }
      } catch (err: any) {
        console.warn(`[project] agent config migration failed: ${err.message}`);
      }
    }

    // Create new directory structure
    const skillsDir = join(newAgentDir, "skills");
    if (!existsSync(newAgentDir)) {
      mkdirSync(newAgentDir, { recursive: true });
    }
    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
    }

    // Create mcp.json template
    const mcpPath = join(newAgentDir, "mcp.json");
    if (!existsSync(mcpPath)) {
      writeFileSync(mcpPath, JSON.stringify({
        "mcpServers": {},
      }, null, 2), "utf-8");
    }

    // Create .gitkeep in skills/
    const gitkeepPath = join(skillsDir, ".gitkeep");
    if (!existsSync(gitkeepPath)) {
      writeFileSync(gitkeepPath, "", "utf-8");
    }

    // Create AGENTS.md template (empty, ready for user to fill in)
    const agentsMdPath = join(newAgentDir, "AGENTS.md");
    if (!existsSync(agentsMdPath)) {
      writeFileSync(agentsMdPath, "", "utf-8");
    }
  }

  ipcMain.handle("project:create", async (_event, args: { rootPath: string; workspaceDirs?: WorkspaceFolder[] }) => {
    const { join } = require("node:path");
    const { writeFileSync, existsSync, mkdirSync } = require("node:fs");

    // Guard against overwriting an existing project
    const prismDir = join(args.rootPath, ".prismnext");
    if (existsSync(prismDir)) {
      throw new Error(
        `A Prism project already exists at "${args.rootPath}". ` +
        `Choose a different directory or open the existing project.`
      );
    }

    // Hidden .prismnext/ structure
    await fs.createDirectory(prismDir);
    await fs.createDirectory(join(prismDir, "sessions"));
    await fs.createDirectory(join(prismDir, "compile"));

    // Build workspace dirs — use provided or default
    const workspaceDirs: WorkspaceFolder[] = args.workspaceDirs && args.workspaceDirs.length > 0
      ? args.workspaceDirs
      : [{ function: "manuscript", name: "manuscript", mainTex: "main.tex" }];

    // Validate server-side — safety net against malformed client data
    const validationErrors = validateWorkspaceDirs(workspaceDirs);
    if (validationErrors.length > 0) {
      throw new Error(
        `Invalid workspace folder configuration:\n${validationErrors.map((e) => `- ${e}`).join("\n")}`,
      );
    }

    // Write settings.json in ONE pass: set version + compiler, then write via workspace-config
    // writeWorkspaceDirs does a read-modify-write, so we pre-populate the initial settings
    // to avoid a second read-write cycle.
    const settingsPath = join(prismDir, "settings.json");
    const initialSettings = { version: 1, compiler: "tectonic" };
    writeFileSync(settingsPath, JSON.stringify(initialSettings, null, 2));
    writeWorkspaceDirs(prismDir, workspaceDirs);

    writeFileSync(join(prismDir, "state.json"), JSON.stringify({}, null, 2));
    writeFileSync(join(prismDir, ".gitignore"), "compile/\nstate.json\n");

    // Create agent-config templates
    await createAgentConfig(prismDir);

    // Create configured folders on disk + log any failures
    const createResult = createConfiguredFolders(args.rootPath, workspaceDirs);
    if (createResult.errors.length > 0) {
      log.warn("project:create — some folders could not be created", {
        rootPath: args.rootPath,
        errors: createResult.errors,
      });
    }

    // Write main.tex into the manuscript folder (if one exists)
    const manuscriptEntry = workspaceDirs.find(d => d.function === "manuscript");
    if (manuscriptEntry && "mainTex" in manuscriptEntry) {
      const manuscriptPath = join(args.rootPath, manuscriptEntry.name);
      const mainTexFullPath = join(manuscriptPath, manuscriptEntry.mainTex);
      // Ensure the parent directory exists (handles mainTex with subdirectories like "tex/main.tex")
      const mainTexDir = join(mainTexFullPath, "..");
      if (!existsSync(mainTexDir)) {
        mkdirSync(mainTexDir, { recursive: true });
      }
      writeFileSync(mainTexFullPath, DEFAULT_MAIN_TEX);
    }
  });

  // ─── Ensure .prismnext/ exists (idempotent) ───
  // Called on every project open (not just create) so that the data hub
  // directory tree is always present. Safe to call on already-initialized
  // projects — it only creates missing files/dirs.
  ipcMain.handle("project:ensure", async (_event, args: { rootPath: string }) => {
    const { join } = require("node:path");
    const { existsSync, mkdirSync } = require("node:fs");

    const prismDir = join(args.rootPath, ".prismnext");
    if (!existsSync(prismDir)) {
      mkdirSync(prismDir, { recursive: true });
    }
    if (!existsSync(join(prismDir, "sessions"))) {
      mkdirSync(join(prismDir, "sessions"), { recursive: true });
    }
    if (!existsSync(join(prismDir, "compile"))) {
      mkdirSync(join(prismDir, "compile"), { recursive: true });
    }

    // Agent config templates — only created if missing, never overwrite
    await createAgentConfig(prismDir);
    const { refreshProjectSkillsIntegration } = await import("../services/project-skills-refresh");
    await refreshProjectSkillsIntegration(args.rootPath);

    // .gitignore — only create if missing
    const gitignorePath = join(prismDir, ".gitignore");
    if (!existsSync(gitignorePath)) {
      const { writeFileSync } = require("node:fs");
      writeFileSync(gitignorePath, "compile/\nstate.json\ncache/\nstate/\n", "utf-8");
    }

    return { success: true };
  });

  ipcMain.handle("project:scaffoldAgentsMd", async (_event, args: { rootPath: string }) => {
    const { join } = require("node:path");
    const { mkdirSync } = require("node:fs");
    const agentDir = join(args.rootPath, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    return await buildAgentsMdScaffold(args.rootPath);
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

  // ─── Template apply (staged writes) ───

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
      const { join, dirname } = require("node:path");
      const {
        writeFileSync,
        mkdirSync,
        readFileSync,
        existsSync,
        unlinkSync,
        copyFileSync,
        rmSync,
      } = require("node:fs");
      const { createHash } = require("node:crypto");

      for (const file of args.files) {
        assertSafeRelativePath(file.path);
      }

      const basePath = join(args.rootPath, args.manuscriptDir);
      const prismDir = join(args.rootPath, ".prismnext");
      const settingsPath = join(prismDir, "settings.json");
      const stagingDir = join(prismDir, ".template-staging");

      let oldAppliedFiles: Record<string, string> = {};
      let oldSettings: Record<string, unknown>;
      if (existsSync(settingsPath)) {
        const raw = readFileSync(settingsPath, "utf-8");
        try {
          oldSettings = JSON.parse(raw);
        } catch {
          const backupPath = settingsPath + ".corrupted." + Date.now();
          writeFileSync(backupPath, raw, "utf-8");
          throw new Error(
            `Project settings file is corrupted. A backup was saved to ${backupPath}. ` +
              `Please restore your settings before switching templates.`,
          );
        }
        const oldTemplate = oldSettings.template as Record<string, unknown> | undefined;
        oldAppliedFiles = (oldTemplate?.appliedFiles as Record<string, string>) || {};
      } else {
        oldSettings = {};
      }

      const newFilePaths = new Set(args.files.map((f) => f.path));

      try {
        if (existsSync(stagingDir)) {
          rmSync(stagingDir, { recursive: true, force: true });
        }
        mkdirSync(stagingDir, { recursive: true });

        for (const file of args.files) {
          const stagedPath = join(stagingDir, file.path);
          mkdirSync(dirname(stagedPath), { recursive: true });
          writeFileSync(stagedPath, file.content, "utf-8");
        }

        for (const oldPath of Object.keys(oldAppliedFiles)) {
          if (!newFilePaths.has(oldPath)) {
            assertSafeRelativePath(oldPath);
            const fullPath = join(basePath, oldPath);
            try {
              if (existsSync(fullPath)) unlinkSync(fullPath);
            } catch {
              /* best effort */
            }
          }
        }

        const appliedFiles: Record<string, string> = {};
        for (const file of args.files) {
          const stagedPath = join(stagingDir, file.path);
          const fullPath = join(basePath, file.path);
          mkdirSync(dirname(fullPath), { recursive: true });
          copyFileSync(stagedPath, fullPath);
          const hash = createHash("sha256").update(file.content).digest("hex");
          appliedFiles[file.path] = `sha256:${hash}`;
        }

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
      } catch (err) {
        log.error("template:apply failed", { error: String(err) });
        throw err;
      } finally {
        try {
          if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
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

    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch {
      log.error("template:get — invalid manifest", { templateId: args.templateId });
      return null;
    }
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
        assertSafeRelativePath(relativePath);
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
        sourceTemplateId?: string;
        targetTemplateId?: string;
      },
    ) => {
      const { join, dirname } = require("node:path");
      const { copyFileSync, mkdirSync, writeFileSync, existsSync, rmSync } = require("node:fs");

      assertSafeRelativePaths(args.files);

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
          sourceTemplateId: args.sourceTemplateId,
          targetTemplateId: args.targetTemplateId,
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

      const entries = (readdirSync(backupsDir, { withFileTypes: true }) as Dirent[])
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

      assertSafeRelativePaths(manifestFiles);

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
          assertSafeRelativePath(oldPath);
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
          assertSafeRelativePath(relativePath);
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

      // Update settings.json with restored file hashes and template metadata
      const labelIds = parseBackupLabelIds(args.backupLabel);
      const restoredTemplateId: string | undefined =
        manifest.sourceTemplateId ?? labelIds.sourceTemplateId;
      const { app } = require("electron");
      const templatesDir = app.isPackaged
        ? join(process.resourcesPath, "resources", "templates")
        : join(app.getAppPath(), "resources", "templates");

      const resolveCategory = (templateId: string): string | undefined => {
        const mPath = join(templatesDir, templateId, "manifest.json");
        if (!existsSync(mPath)) return undefined;
        try {
          const m = JSON.parse(readFileSync(mPath, "utf-8"));
          return typeof m.category === "string" ? m.category : undefined;
        } catch {
          return undefined;
        }
      };

      if (restoredTemplateId) {
        if (!settings.template || typeof settings.template !== "object") {
          settings.template = {};
        }
        const tmpl = settings.template as Record<string, unknown>;
        tmpl.id = restoredTemplateId;
        const cat = resolveCategory(restoredTemplateId);
        if (cat) tmpl.category = cat;
        tmpl.appliedFiles = newAppliedFiles;
        tmpl.appliedAt = new Date().toISOString();
      } else if (!manifest.sourceTemplateId && !labelIds.sourceTemplateId) {
        // first-use style backup — restored user content before any template id
        delete settings.template;
      } else {
        if (!settings.template) {
          settings.template = {};
        }
        (settings.template as Record<string, unknown>).appliedFiles = newAppliedFiles;
        (settings.template as Record<string, unknown>).appliedAt = new Date().toISOString();
      }

      mkdirSync(prismDir, { recursive: true });
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");

      log.info("template:restoreBackup", { backupLabel: args.backupLabel, restored: restored.length });
      return { restored };
    },
  );

  // ─── Template backup delete ───

  ipcMain.handle(
    "template:deleteBackup",
    async (
      _event,
      args: { rootPath: string; backupLabel: string },
    ) => {
      const { join, resolve, relative, isAbsolute } = require("node:path");
      const { existsSync, rmSync } = require("node:fs");

      const label = args.backupLabel;
      if (!label || label.includes("/") || label.includes("\\") || label.includes("..")) {
        throw new Error(`Invalid backup label: ${label}`);
      }

      const backupsDir = join(args.rootPath, ".prismnext", "backups");
      const backupDir = join(backupsDir, label);
      const rel = relative(resolve(backupsDir), resolve(backupDir));
      if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`Invalid backup path: ${label}`);
      }

      if (!existsSync(backupDir)) {
        throw new Error(`Backup not found: ${label}`);
      }

      rmSync(backupDir, { recursive: true, force: true });
      log.info("template:deleteBackup", { backupLabel: label });
      return { deleted: true };
    },
  );

}
