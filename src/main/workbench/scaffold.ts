/**
 * On-disk project meta under `.workbench/` (D-3 / D-14).
 * Create / ensure / check write this directory only — never `.prismnext/`.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseRemoteAbs } from "../../shared/remote";
import type { WorkspaceFolder } from "../../shared/workbench/workspace-folder";
import {
  PROJECT_COMPILE_DIRNAME,
  PROJECT_META_DIR,
  WORKBENCH_JSON_FILENAME,
  workbenchJsonRel,
} from "../../shared/workbench/paths";
import { ensureResearchBrief } from "../research/research-brief-service";
import {
  createConfiguredFolders,
  DEFAULT_WORKSPACE_FOLDERS,
  ensureMainTex,
  readWorkspaceDirs,
  validateWorkspaceDirs,
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

function localProjectRoot(projectRoot: string): string {
  if (parseRemoteAbs(projectRoot)) {
    throw new Error("remote_project_root_is_not_local");
  }
  return resolve(projectRoot);
}

export function projectMetaAbs(projectRoot: string): string {
  return join(localProjectRoot(projectRoot), PROJECT_META_DIR);
}

export interface CreateWorkbenchProjectArgs {
  rootPath: string;
  workspaceDirs?: WorkspaceFolder[];
}

export interface WorkbenchProjectRef {
  projectId: string;
}

export function scaffoldWorkbenchProject(projectRoot: string, projectId: string): void {
  const root = localProjectRoot(projectRoot);
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
  patch: { compiler?: string },
): void {
  writeProjectSettings(metaDir, {
    version: 1,
    compiler: patch.compiler ?? "tectonic",
  });
}

export function createWorkbenchProjectOnDisk(args: CreateWorkbenchProjectArgs): WorkbenchProjectRef {
  const root = localProjectRoot(args.rootPath);
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

  ensureAgentDir(metaDir);
  createConfiguredFolders(root, workspaceDirs);
  ensureMainTex(root);
  return { projectId };
}

export function ensureWorkbenchProjectMeta(projectRoot: string): WorkbenchProjectRef {
  const root = localProjectRoot(projectRoot);
  mkdirSync(root, { recursive: true });
  const projectId = ensureWorkbenchId(root);
  scaffoldWorkbenchProject(root, projectId);
  const existing = readWorkbenchJson(root);
  if (!existing?.workspace?.folders?.length) {
    writeWorkspaceDirs(root, DEFAULT_WORKSPACE_FOLDERS);
  }
  createConfiguredFolders(root, readWorkspaceDirs(root));
  const metaDir = projectMetaAbs(root);
  if (!existsSync(join(metaDir, "settings.json"))) {
    writeLocalSettings(metaDir, { compiler: "tectonic" });
  }
  ensureAgentDir(metaDir);
  ensureResearchBrief(root);
  return { projectId };
}

export function checkWorkbenchProject(projectRoot: string): { missing: string[] } {
  const root = localProjectRoot(projectRoot);
  const missing: string[] = [];
  const jsonPath = join(root, workbenchJsonRel());
  if (!existsSync(jsonPath)) missing.push(`${PROJECT_META_DIR}/${WORKBENCH_JSON_FILENAME}`);
  if (!existsSync(join(root, PROJECT_META_DIR, PROJECT_COMPILE_DIRNAME))) {
    missing.push(`${PROJECT_META_DIR}/${PROJECT_COMPILE_DIRNAME}/`);
  }
  return { missing };
}
