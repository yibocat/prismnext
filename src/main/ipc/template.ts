import { ipcMain } from "electron";
import { createLogger } from "../app/logger";
import type { Dirent } from "node:fs";
import {
  assertSafeRelativePath,
  assertSafeRelativePaths,
  parseBackupLabelIds,
} from "../lib/template-path";
import { projectMetaAbs, projectMetaAbsIfLocal } from "../workbench/scaffold";

const templateLog = createLogger("template-ipc", "ipc");

export function registerTemplateHandlers(): void {
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
      const prismDir = projectMetaAbs(args.rootPath);
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

        templateLog.info("template:apply", {
          rootPath: args.rootPath,
          templateId: args.templateId,
          count: args.files.length,
        });
        return { appliedFiles };
      } catch (err) {
        templateLog.error("template:apply failed", { error: String(err) });
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

    templateLog.info("template:list", { count: result.length });
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
      templateLog.info("template:preview — no preview.png", { templateId: args.templateId });
      return null;
    }

    try {
      const buffer = readFileSync(pngPath);
      templateLog.info("template:preview", { templateId: args.templateId, sizeBytes: buffer.length });
      return `data:image/png;base64,${buffer.toString("base64")}`;
    } catch (err) {
      templateLog.error("template:preview failed", { templateId: args.templateId, error: String(err) });
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
      templateLog.error("template:get — invalid manifest", { templateId: args.templateId });
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
    templateLog.info("template:get", { templateId: args.templateId, fileCount: files.length });
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
      templateLog.info("template:getPdfData — no preview.pdf", { templateId: args.templateId });
      return null;
    }

    try {
      const buffer = readFileSync(pdfPath);
      templateLog.info("template:getPdfData", { templateId: args.templateId, sizeBytes: buffer.length });
      return `data:application/pdf;base64,${buffer.toString("base64")}`;
    } catch (err) {
      templateLog.error("template:getPdfData failed", { templateId: args.templateId, error: String(err) });
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

      templateLog.info("template:detectChanges", {
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
      const backupsDir = join(projectMetaAbs(args.rootPath), "backups");
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

      templateLog.info("template:backup", { backupDir: actualBackupDir, fileCount: copied.length });
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

      const metaDir = projectMetaAbsIfLocal(args.rootPath);
      if (!metaDir) return [];

      const backupsDir = join(metaDir, "backups");
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

      templateLog.info("template:listBackups", { count: entries.length });
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

      const backupsDir = join(projectMetaAbs(args.rootPath), "backups");
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
      const prismDir = projectMetaAbs(args.rootPath);
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
        templateLog.error("template:restoreBackup failed mid-operation", {
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

      templateLog.info("template:restoreBackup", { backupLabel: args.backupLabel, restored: restored.length });
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

      const backupsDir = join(projectMetaAbs(args.rootPath), "backups");
      const backupDir = join(backupsDir, label);
      const rel = relative(resolve(backupsDir), resolve(backupDir));
      if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`Invalid backup path: ${label}`);
      }

      if (!existsSync(backupDir)) {
        throw new Error(`Backup not found: ${label}`);
      }

      rmSync(backupDir, { recursive: true, force: true });
      templateLog.info("template:deleteBackup", { backupLabel: label });
      return { deleted: true };
    },
  );
}
