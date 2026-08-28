import { BrowserWindow, dialog, ipcMain } from "electron";
import { basename, extname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { compileLatex, detectTexlive, detectTectonic } from "../compile/facade";
import { parseRemoteAbs } from "../../shared/remote";
import { routeHostDomainMethod } from "../remote/domain-route";
import { getRemoteSessionBroker } from "./remote";
import { pullRemoteBlob } from "../remote/sync-client";
import { createLogger } from "../app/logger";
import {
  fileExists,
  packManuscriptDirectory,
  resolveCompilePdfAbsolutePath,
  writeUint8File,
} from "../compile/manuscript-export";

const log = createLogger("compile-ipc", "compile");

const EMPTY_DETECT = { texlive: { available: false, engines: [] as string[], version: null }, tectonic: false };

async function routeIfRemote(method: string, args: unknown, keys: string[]): Promise<unknown | undefined> {
  return routeHostDomainMethod(method, args, {
    keys,
    broker: getRemoteSessionBroker(),
    disconnected(name) {
      if (name === "compile:detectTexlive") {
        return { hit: true, result: EMPTY_DETECT };
      }
      return { hit: false };
    },
  });
}

function projectName(projectRoot: string): string {
  return basename(projectRoot) || "project";
}

export function registerCompileHandlers(): void {
  ipcMain.handle(
    "compile:execute",
    async (
      _event,
      args: {
        projectDir: string;
        mainFile: string;
        useTexlive?: boolean;
        dirtyRelPaths?: string[];
        dirtyFiles?: Array<{ relPath: string; content: string }>;
        pdfOnDisk?: boolean;
        skipSynctex?: boolean;
        fast?: boolean;
      },
    ) => {
      log.debug("compile:execute", {
        mainFile: args.mainFile,
        useTexlive: args.useTexlive ?? false,
        dirty: args.dirtyRelPaths?.length ?? 0,
        skipSynctex: args.skipSynctex ?? false,
        fast: args.fast ?? false,
      });
      const routed = await routeIfRemote("compile:execute", { ...args, pdfOnDisk: true }, ["projectDir"]);
      if (routed !== undefined) {
        const remote = parseRemoteAbs(args.projectDir);
        const raw = routed as {
          pdfPath?: string;
          stdout?: string;
          error?: string;
          buildDir?: string;
        };
        if (raw.error) return { error: raw.error, stdout: raw.stdout };
        if (raw.pdfPath && remote) {
          const bytes = await pullRemoteBlob(getRemoteSessionBroker(), remote.profileId, "fs:readBlob", {
            path: raw.pdfPath,
          });
          if (bytes.byteLength === 0) {
            return { error: raw.error || "Compilation failed", stdout: raw.stdout };
          }
          // Preview consumes pdfBytes. A system-temp path would fail fs:readBytes
          // (that API only allows files under the user home).
          const pdfBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          log.debug("compile:execute success", {
            bytes: pdfBytes.byteLength,
            remote: remote.profileId,
          });
          return { pdfBytes, stdout: raw.stdout, buildDir: raw.buildDir };
        }
        return { error: raw.error || "Compilation failed", stdout: raw.stdout };
      }
      const result = await compileLatex(
        args.projectDir,
        args.mainFile,
        args.useTexlive,
        {
          dirtyRelPaths: args.dirtyRelPaths,
          dirtyFiles: args.dirtyFiles,
          pdfOnDisk: args.pdfOnDisk,
          skipSynctex: args.skipSynctex,
          fast: args.fast,
          source: "ui",
        },
      );
      if (result.success && (result.pdfBytes || result.pdfPath)) {
        log.debug("compile:execute success", {
          bytes: result.pdfBytes?.length,
          pdfPath: result.pdfPath,
        });
        return {
          pdfBytes: result.pdfBytes,
          pdfPath: result.pdfPath,
          buildDir: result.buildDir,
          stdout: result.logContent,
        };
      } else {
        log.debug("compile:execute failed", { error: result.error || "unknown" });
        return { error: result.error || "Compilation failed", stdout: result.logContent };
      }
    },
  );

  ipcMain.handle(
    "compile:detectTexlive",
    async (_event, args?: { projectRoot?: string }) => {
      const routed = await routeIfRemote("compile:detectTexlive", args ?? {}, ["projectRoot"]);
      if (routed !== undefined) return routed;
      const texliveStatus = await detectTexlive();
      const tectonicAvailable = await detectTectonic();
      return {
        texlive: texliveStatus,
        tectonic: tectonicAvailable,
      };
    },
  );

  ipcMain.handle(
    "compile:exportPdf",
    async (
      _event,
      args: { projectRoot: string; mainFile: string; pdfBytes?: Uint8Array | null },
    ) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return { canceled: true as const };

      const pdfPath = resolveCompilePdfAbsolutePath(args.projectRoot, args.mainFile);
      let bytes: Uint8Array | null = null;
      if (await fileExists(pdfPath)) {
        bytes = new Uint8Array(await readFile(pdfPath));
      } else if (args.pdfBytes && args.pdfBytes.byteLength > 0) {
        bytes = args.pdfBytes instanceof Uint8Array
          ? args.pdfBytes
          : new Uint8Array(args.pdfBytes as ArrayBuffer);
      }

      if (!bytes || bytes.byteLength === 0) {
        return { canceled: false as const, ok: false as const, error: "no-pdf" };
      }

      const stem = basename(args.mainFile, extname(args.mainFile));
      const result = await dialog.showSaveDialog(win, {
        title: "Export compiled PDF",
        defaultPath: `${projectName(args.projectRoot)}-${stem}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (result.canceled || !result.filePath) {
        return { canceled: true as const };
      }

      await writeUint8File(result.filePath, bytes);
      log.info("compile:exportPdf", { path: result.filePath, bytes: bytes.byteLength });
      return { canceled: false as const, ok: true as const, path: result.filePath };
    },
  );

  ipcMain.handle(
    "manuscript:packZip",
    async (
      _event,
      args: { projectRoot: string; manuscriptDir: string },
    ) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return { canceled: true as const };

      const manuscriptAbs = join(args.projectRoot, args.manuscriptDir);
      if (!(await fileExists(manuscriptAbs))) {
        return {
          canceled: false as const,
          ok: false as const,
          error: "no-manuscript",
        };
      }

      const result = await dialog.showSaveDialog(win, {
        title: "Pack manuscript",
        defaultPath: `${projectName(args.projectRoot)}-manuscript.zip`,
        filters: [{ name: "ZIP", extensions: ["zip"] }],
      });
      if (result.canceled || !result.filePath) {
        return { canceled: true as const };
      }

      try {
        const zipBytes = await packManuscriptDirectory(manuscriptAbs);
        await writeUint8File(result.filePath, zipBytes);
        log.info("manuscript:packZip", {
          path: result.filePath,
          bytes: zipBytes.byteLength,
        });
        return { canceled: false as const, ok: true as const, path: result.filePath };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn("manuscript:packZip failed", { error: message });
        return {
          canceled: false as const,
          ok: false as const,
          error: message,
        };
      }
    },
  );
}
