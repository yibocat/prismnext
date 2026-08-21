/**
 * Built-in default project (D-8 / D-18 / D-19).
 * Default is a role (defaultProjectId), not a special folder.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type {
  WorkbenchProjectMember,
  WorkbenchProjectMeta,
  WorkbenchState,
} from "../../shared/workbench-api";
import {
  BUILTIN_DEFAULT_PROJECT_DIRNAME,
  PROJECTS_DIRNAME,
  normalizeWorkbenchPath,
  projectSlotMetaRel,
  projectSlotRel,
} from "../../shared/workbench-paths";
import { replaceRegisteredRoots } from "../services/active-project-roots";
import {
  ensureWorkbenchHome,
  isPathInsideWorkbenchHome,
  isWorkbenchHomePath,
  parseHomeWorktreeCheckout,
  readWorkbenchHomeSettings,
  resolveWorkbenchHome,
  writeWorkbenchHomeSettings,
  type WorkbenchHomeOpts,
} from "./home";
import {
  ensureWorkbenchId,
  readWorkbenchJson,
  resolveOpenFolder,
  writeWorkbenchJson,
  type WorkbenchSlot,
} from "./identity";
import { scaffoldWorkbenchProject } from "./scaffold";

export interface DefaultProjectOpts extends WorkbenchHomeOpts {
  documentsDir?: string;
}

export interface DefaultProjectRef {
  projectId: string;
  lastPath: string;
}

function resolveDocumentsDir(opts?: DefaultProjectOpts): string {
  if (opts?.documentsDir) return resolve(opts.documentsDir);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require("electron") as { app?: { getPath?: (name: string) => string } };
    const docs = electron.app?.getPath?.("documents");
    if (typeof docs === "string" && docs.trim()) return resolve(docs);
  } catch {
    // vitest / non-electron
  }
  return resolve(join(opts?.homeDir ?? homedir(), "Documents"));
}

export function resolveBuiltinDefaultProjectPath(opts?: DefaultProjectOpts): string {
  return normalizeWorkbenchPath(join(resolveDocumentsDir(opts), BUILTIN_DEFAULT_PROJECT_DIRNAME));
}

function slotMetaAbs(projectId: string, opts?: WorkbenchHomeOpts): string {
  return join(resolveWorkbenchHome(opts), projectSlotMetaRel(projectId));
}

export function readProjectSlotMeta(
  projectId: string,
  opts?: WorkbenchHomeOpts,
): WorkbenchProjectMeta | null {
  const file = slotMetaAbs(projectId, opts);
  if (!existsSync(file)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const lastPath = (raw as { lastPath?: unknown }).lastPath;
  if (typeof lastPath !== "string" || !lastPath.trim()) return null;
  const displayName = (raw as { displayName?: unknown }).displayName;
  const out: WorkbenchProjectMeta = {
    lastPath: normalizeWorkbenchPath(resolve(lastPath.trim())),
  };
  if (typeof displayName === "string" && displayName.trim()) {
    out.displayName = displayName.trim();
  }
  return out;
}

export function writeProjectSlotMeta(
  projectId: string,
  meta: WorkbenchProjectMeta,
  opts?: WorkbenchHomeOpts,
): void {
  const home = ensureWorkbenchHome(opts);
  const file = join(home, projectSlotMetaRel(projectId));
  mkdirSync(join(home, projectSlotRel(projectId)), { recursive: true });
  const payload: WorkbenchProjectMeta = {
    lastPath: normalizeWorkbenchPath(resolve(meta.lastPath)),
  };
  if (meta.displayName?.trim()) payload.displayName = meta.displayName.trim();
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export { scaffoldWorkbenchProject } from "./scaffold";

function displayNameFor(lastPath: string, stored?: string): string {
  if (stored?.trim()) return stored.trim();
  const base = basename(lastPath);
  return base || BUILTIN_DEFAULT_PROJECT_DIRNAME;
}

function rememberMember(
  projectId: string,
  lastPath: string,
  opts?: DefaultProjectOpts,
  defaultId?: string | null,
): void {
  writeProjectSlotMeta(projectId, {
    lastPath,
    displayName: displayNameFor(lastPath),
  }, opts);
  const current = readWorkbenchHomeSettings(opts);
  const ids = [...current.workbenchProjectIds];
  if (!ids.includes(projectId)) ids.push(projectId);
  const nextDefault = defaultId ?? current.defaultProjectId ?? projectId;
  if (nextDefault && !ids.includes(nextDefault)) ids.unshift(nextDefault);
  writeWorkbenchHomeSettings({
    defaultProjectId: nextDefault,
    workbenchProjectIds: [...new Set(ids)],
  }, opts);
}

export function ensureDefaultProject(opts?: DefaultProjectOpts): DefaultProjectRef {
  ensureWorkbenchHome(opts);
  const settings = readWorkbenchHomeSettings(opts);
  if (settings.defaultProjectId) {
    const meta = readProjectSlotMeta(settings.defaultProjectId, opts);
    if (meta?.lastPath) {
      mkdirSync(meta.lastPath, { recursive: true });
      scaffoldWorkbenchProject(meta.lastPath, settings.defaultProjectId);
      rememberMember(settings.defaultProjectId, meta.lastPath, opts, settings.defaultProjectId);
      return { projectId: settings.defaultProjectId, lastPath: meta.lastPath };
    }
    const rebound = resolveBuiltinDefaultProjectPath(opts);
    mkdirSync(rebound, { recursive: true });
    const disk = readWorkbenchJson(rebound);
    if (disk && disk.id !== settings.defaultProjectId) {
      throw new Error("default_project_path_conflict");
    }
    if (!disk) {
      writeWorkbenchJson(rebound, { id: settings.defaultProjectId });
    }
    scaffoldWorkbenchProject(rebound, settings.defaultProjectId);
    rememberMember(settings.defaultProjectId, rebound, opts, settings.defaultProjectId);
    return { projectId: settings.defaultProjectId, lastPath: rebound };
  }

  const lastPath = resolveBuiltinDefaultProjectPath(opts);
  mkdirSync(lastPath, { recursive: true });
  const existing = readWorkbenchJson(lastPath);
  const projectId = existing?.id ?? ensureWorkbenchId(lastPath);
  scaffoldWorkbenchProject(lastPath, projectId);
  rememberMember(projectId, lastPath, opts, projectId);
  return { projectId, lastPath };
}

export function setDefaultProjectId(projectId: string, opts?: DefaultProjectOpts): DefaultProjectRef {
  const id = projectId.trim();
  if (!id) throw new Error("missing_project_id");
  const meta = readProjectSlotMeta(id, opts);
  if (!meta?.lastPath) throw new Error(`unknown_project:${id}`);
  rememberMember(id, meta.lastPath, opts, id);
  return { projectId: id, lastPath: meta.lastPath };
}

export function listProjectSlots(opts?: WorkbenchHomeOpts): WorkbenchSlot[] {
  const home = resolveWorkbenchHome(opts);
  const dir = join(home, PROJECTS_DIRNAME);
  if (!existsSync(dir)) return [];
  const slots: WorkbenchSlot[] = [];
  for (const name of readdirSync(dir)) {
    const meta = readProjectSlotMeta(name, opts);
    if (meta) slots.push({ id: name, lastPath: meta.lastPath });
  }
  return slots;
}

function liveMemberPaths(opts?: DefaultProjectOpts): string[] {
  return listWorkbenchMembers(opts)
    .map((member) => member.lastPath)
    .filter((lastPath) => existsSync(lastPath));
}

export function syncWorkbenchRegisteredRoots(opts?: DefaultProjectOpts): void {
  try {
    replaceRegisteredRoots(listWorkbenchMembers(opts).map((member) => member.lastPath));
  } catch {
    // Missing home / tests without a real user home.
  }
}

export function openWorkbenchFolder(absPath: string, opts?: DefaultProjectOpts): DefaultProjectRef {
  const lastPath = normalizeWorkbenchPath(resolve(absPath.trim()));
  if (!lastPath || lastPath === "/") throw new Error("missing_folder");
  const checkout = parseHomeWorktreeCheckout(lastPath, opts);
  if (checkout) {
    const meta = readProjectSlotMeta(checkout.projectId, opts);
    if (!meta?.lastPath) throw new Error("cannot_open_worktree_as_project");
    return openWorkbenchFolder(meta.lastPath, opts);
  }
  if (isWorkbenchHomePath(lastPath, opts) || isPathInsideWorkbenchHome(lastPath, opts)) {
    throw new Error("cannot_open_workbench_home");
  }
  mkdirSync(lastPath, { recursive: true });
  const disk = readWorkbenchJson(lastPath);
  const decision = resolveOpenFolder({
    absPath: lastPath,
    workbenchId: disk?.id ?? null,
    slots: listProjectSlots(opts),
    livePaths: liveMemberPaths(opts),
  });
  if (decision.action === "mint") {
    writeWorkbenchJson(lastPath, { id: decision.id, workspace: disk?.workspace });
  }
  scaffoldWorkbenchProject(lastPath, decision.id);
  const settings = readWorkbenchHomeSettings(opts);
  rememberMember(decision.id, lastPath, opts, settings.defaultProjectId);
  return { projectId: decision.id, lastPath };
}

export function removeWorkbenchProject(projectId: string, opts?: DefaultProjectOpts): WorkbenchState {
  const id = projectId.trim();
  if (!id) throw new Error("missing_project_id");
  const settings = readWorkbenchHomeSettings(opts);
  if (id === settings.defaultProjectId) throw new Error("cannot_remove_default");
  writeWorkbenchHomeSettings({
    defaultProjectId: settings.defaultProjectId,
    workbenchProjectIds: settings.workbenchProjectIds.filter((item) => item !== id),
  }, opts);
  return getWorkbenchState(opts);
}

export function setDefaultFromFolder(absPath: string, opts?: DefaultProjectOpts): DefaultProjectRef {
  const opened = openWorkbenchFolder(absPath, opts);
  return setDefaultProjectId(opened.projectId, opts);
}

export function listWorkbenchMembers(opts?: DefaultProjectOpts): WorkbenchProjectMember[] {
  const settings = readWorkbenchHomeSettings(opts);
  const seen = new Set<string>();
  const members: WorkbenchProjectMember[] = [];
  for (const id of settings.workbenchProjectIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const meta = readProjectSlotMeta(id, opts);
    if (!meta?.lastPath) continue;
    members.push({
      id,
      lastPath: meta.lastPath,
      displayName: displayNameFor(meta.lastPath, meta.displayName),
    });
  }
  return members;
}

export function getWorkbenchState(opts?: DefaultProjectOpts): WorkbenchState {
  const ref = ensureDefaultProject(opts);
  const members = listWorkbenchMembers(opts);
  const settings = readWorkbenchHomeSettings(opts);
  return {
    defaultProjectId: ref.projectId,
    defaultLastPath: ref.lastPath,
    workbenchProjectIds: settings.workbenchProjectIds.length > 0
      ? settings.workbenchProjectIds
      : [ref.projectId],
    members: members.length > 0
      ? members
      : [{
          id: ref.projectId,
          lastPath: ref.lastPath,
          displayName: displayNameFor(ref.lastPath),
        }],
  };
}
