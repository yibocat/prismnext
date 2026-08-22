/**
 * On-disk project meta under `.workbench/` (D-3 / D-14).
 * Create / ensure / check write this directory only — never `.prismnext/`.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { WorkspaceFolder } from "../../shared/workbench/workspace-folder";
import {
  ICON_IMAGE_FILENAME,
  normalizeIconSpec,
  type IconSpec,
} from "../../shared/platform/icon-spec";
import {
  PROJECT_COMPILE_DIRNAME,
  PROJECT_META_DIR,
  WORKBENCH_JSON_FILENAME,
  workbenchJsonRel,
} from "../../shared/workbench/paths";
import { ensureResearchBrief } from "../services/research-brief-service";
import {
  createConfiguredFolders,
  DEFAULT_WORKSPACE_FOLDERS,
  validateWorkspaceDirs,
  writeProjectIcon,
  writeProjectIconImage,
  writeProjectSettings,
  writeWorkspaceDirs,
} from "../project/workspace-config";
import {
  ensureWorkbenchId,
  mintProjectId,
  readWorkbenchJson,
  writeWorkbenchJson,
} from "./identity";

export const WORKBENCH_GITIGNORE = [
  "compile/",
  ".venv/",
  "experiments/",
  "interactions/",
  "provenance.jsonl",
  "settings.json",
  "state.json",
  "cache/",
  "state/",
  "backups/",
  "",
].join("\n");

export const DEFAULT_MAIN_TEX = String.raw`\documentclass{article}

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

export function projectMetaAbs(projectRoot: string): string {
  return join(resolve(projectRoot), PROJECT_META_DIR);
}

export interface CreateWorkbenchProjectArgs {
  rootPath: string;
  workspaceDirs?: WorkspaceFolder[];
  projectIcon?: IconSpec | string | null;
  projectIconImagePngBase64?: string;
}

export interface WorkbenchProjectRef {
  projectId: string;
}

export function scaffoldWorkbenchProject(projectRoot: string, projectId: string): void {
  const root = resolve(projectRoot);
  mkdirSync(root, { recursive: true });
  const metaDir = projectMetaAbs(root);
  mkdirSync(join(metaDir, PROJECT_COMPILE_DIRNAME), { recursive: true });
  mkdirSync(join(metaDir, "agent"), { recursive: true });
  const existing = readWorkbenchJson(root);
  if (!existing) {
    writeWorkbenchJson(root, {
      id: projectId,
      workspace: { folders: DEFAULT_WORKSPACE_FOLDERS },
    });
  } else if (existing.id !== projectId) {
    throw new Error(`workbench_id_mismatch:${existing.id}`);
  } else if (!existing.workspace?.folders?.length) {
    writeWorkbenchJson(root, {
      id: existing.id,
      workspace: { ...existing.workspace, folders: DEFAULT_WORKSPACE_FOLDERS },
    });
  }
  const gitignore = join(metaDir, ".gitignore");
  if (!existsSync(gitignore)) {
    writeFileSync(gitignore, WORKBENCH_GITIGNORE, "utf-8");
  }
  const agentsMd = join(metaDir, "agent", "AGENTS.md");
  if (!existsSync(agentsMd)) {
    writeFileSync(agentsMd, "", "utf-8");
  }
}

function ensureAgentDir(metaDir: string): void {
  const agentDir = join(metaDir, "agent");
  mkdirSync(agentDir, { recursive: true });
  const agentsMd = join(agentDir, "AGENTS.md");
  if (!existsSync(agentsMd)) {
    writeFileSync(agentsMd, "", "utf-8");
  }
}

function writeLocalSettings(
  metaDir: string,
  patch: { compiler?: string; projectIcon?: IconSpec | string },
): void {
  writeProjectSettings(metaDir, {
    version: 1,
    compiler: patch.compiler ?? "tectonic",
    ...(patch.projectIcon ? { projectIcon: patch.projectIcon } : {}),
  });
}

function writeManuscriptStub(projectRoot: string, workspaceDirs: WorkspaceFolder[]): void {
  const manuscriptEntry = workspaceDirs.find((d) => d.function === "manuscript");
  if (!manuscriptEntry || !("mainTex" in manuscriptEntry)) return;
  const mainTexFullPath = join(projectRoot, manuscriptEntry.name, manuscriptEntry.mainTex);
  const mainTexDir = join(mainTexFullPath, "..");
  if (!existsSync(mainTexDir)) {
    mkdirSync(mainTexDir, { recursive: true });
  }
  if (!existsSync(mainTexFullPath)) {
    writeFileSync(mainTexFullPath, DEFAULT_MAIN_TEX);
  }
}

export function createWorkbenchProjectOnDisk(args: CreateWorkbenchProjectArgs): WorkbenchProjectRef {
  const root = resolve(args.rootPath);
  mkdirSync(root, { recursive: true });
  if (existsSync(join(root, workbenchJsonRel()))) {
    throw new Error(
      `A workbench project already exists at "${root}". ` +
        `Choose a different directory or open the existing project.`,
    );
  }

  const workspaceDirs: WorkspaceFolder[] =
    args.workspaceDirs && args.workspaceDirs.length > 0
      ? args.workspaceDirs
      : DEFAULT_WORKSPACE_FOLDERS;
  const validationErrors = validateWorkspaceDirs(workspaceDirs);
  if (validationErrors.length > 0) {
    throw new Error(
      `Invalid workspace folder configuration:\n${validationErrors.map((e) => `- ${e}`).join("\n")}`,
    );
  }

  const projectId = mintProjectId();
  writeWorkbenchJson(root, { id: projectId, workspace: { folders: workspaceDirs } });
  scaffoldWorkbenchProject(root, projectId);

  const metaDir = projectMetaAbs(root);
  writeLocalSettings(metaDir, { compiler: "tectonic" });
  const iconSpec = normalizeIconSpec(args.projectIcon);
  if (args.projectIconImagePngBase64) {
    const png = Buffer.from(args.projectIconImagePngBase64, "base64");
    if (png.length > 0 && png.length <= 256 * 1024) {
      writeProjectIconImage(metaDir, png);
    }
  } else if (iconSpec && iconSpec.kind !== "image") {
    writeProjectIcon(metaDir, iconSpec);
  }

  ensureAgentDir(metaDir);
  createConfiguredFolders(root, workspaceDirs);
  writeManuscriptStub(root, workspaceDirs);
  return { projectId };
}

export function ensureWorkbenchProjectMeta(projectRoot: string): WorkbenchProjectRef {
  const root = resolve(projectRoot);
  mkdirSync(root, { recursive: true });
  const projectId = ensureWorkbenchId(root);
  scaffoldWorkbenchProject(root, projectId);
  const existing = readWorkbenchJson(root);
  if (!existing?.workspace?.folders?.length) {
    writeWorkspaceDirs(root, DEFAULT_WORKSPACE_FOLDERS);
  }
  const metaDir = projectMetaAbs(root);
  if (!existsSync(join(metaDir, "settings.json"))) {
    writeLocalSettings(metaDir, { compiler: "tectonic" });
  }
  ensureAgentDir(metaDir);
  ensureResearchBrief(root);
  return { projectId };
}

export function checkWorkbenchProject(projectRoot: string): { missing: string[] } {
  const root = resolve(projectRoot);
  const missing: string[] = [];
  const jsonPath = join(root, workbenchJsonRel());
  if (!existsSync(jsonPath)) missing.push(`${PROJECT_META_DIR}/${WORKBENCH_JSON_FILENAME}`);
  if (!existsSync(join(root, PROJECT_META_DIR, PROJECT_COMPILE_DIRNAME))) {
    missing.push(`${PROJECT_META_DIR}/${PROJECT_COMPILE_DIRNAME}/`);
  }
  return { missing };
}
