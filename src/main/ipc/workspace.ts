// prism-next/src/main/ipc/workspace.ts

import { ipcMain } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  readWorkspaceDirs,
  writeWorkspaceDirs,
  validateWorkspaceDirs,
  createConfiguredFolders,
} from "../project/workspace-config";
import type { WorkspaceFolder } from "../../shared/workbench/workspace-folder";
import { isRemoteProjectRoot } from "../../shared/remote";
import { promptManager } from "../prompts";

export function registerWorkspaceHandlers(): void {
  ipcMain.handle(
    "workspace:getConfig",
    async (
      _event,
      args: { projectRoot: string },
    ): Promise<WorkspaceFolder[]> => {
      return readWorkspaceDirs(args.projectRoot);
    },
  );

  ipcMain.handle(
    "workspace:updateConfig",
    async (
      _event,
      args: { projectRoot: string; dirs: WorkspaceFolder[] },
    ): Promise<{ success: boolean; errors?: string[] }> => {
      // Validate server-side as safety net
      if (isRemoteProjectRoot(args.projectRoot)) return { success: true };
      const errors = validateWorkspaceDirs(args.dirs);
      if (errors.length > 0) {
        return { success: false, errors };
      }
      writeWorkspaceDirs(args.projectRoot, args.dirs);
      // Workspace folder structure changed — invalidate prompt cache
      // so workspace-folders module reflects the new layout.
      promptManager.invalidate();
      return { success: true };
    },
  );

  ipcMain.handle(
    "workspace:createFolders",
    async (
      _event,
      args: { projectRoot: string; dirs?: WorkspaceFolder[] },
    ): Promise<{ created: string[]; errors: { folder: string; error: string }[] }> => {
      if (isRemoteProjectRoot(args.projectRoot)) return { created: [], errors: [] };
      const dirs = args.dirs ?? readWorkspaceDirs(args.projectRoot);
      return createConfiguredFolders(args.projectRoot, dirs);
    },
  );

  ipcMain.handle(
    "workspace:ensureMainTex",
    async (
      _event,
      args: { projectRoot: string },
    ): Promise<{ created: boolean; relativePath?: string }> => {
      if (isRemoteProjectRoot(args.projectRoot)) return { created: false };
      const dirs = readWorkspaceDirs(args.projectRoot);
      const manuscript = dirs.find(
        (d): d is import("../../renderer/types/workspace").ManuscriptFolder =>
          d.function === "manuscript",
      );
      if (!manuscript) return { created: false };

      const mainTexPath = path.join(
        args.projectRoot,
        manuscript.name,
        manuscript.mainTex,
      );

      // Don't overwrite existing main.tex
      if (fs.existsSync(mainTexPath)) return { created: false };

      // Ensure parent directory exists (handles nested mainTex paths like "tex/main.tex")
      const parentDir = path.dirname(mainTexPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

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

\begin{document}

\maketitle

\section{Introduction}

\end{document}
`;

      fs.writeFileSync(mainTexPath, DEFAULT_MAIN_TEX, "utf-8");
      return {
        created: true,
        relativePath: `${manuscript.name}/${manuscript.mainTex}`,
      };
    },
  );

}
