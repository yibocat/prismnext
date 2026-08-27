/**
 * Built-in default project (D-8 / D-18 / D-19).
 * Default is a role (defaultProjectId), not a special folder.
 * Membership is optional: the default folder can leave the workbench list
 * and still be the fallback for new chats.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { isRemoteProjectRoot, recoverRemoteAbs } from "../../shared/remote";
import {
  sameIdSet,
  type WorkbenchProjectMember,
  type WorkbenchProjectMeta,
  type WorkbenchState,
} from "../../shared/workbench/api";
import {
  BUILTIN_DEFAULT_PROJECT_DIRNAME,
  PROJECTS_DIRNAME,
  normalizeWorkbenchPath,
  projectSlotMetaRel,
  projectSlotRel,
} from "../../shared/workbench/paths";
import { replaceRegisteredRoots } from "../project/active-project-roots";
import {
  markProjectDirectoryRemoved,
  readProjectDirectory,
  rememberProjectDirectory,
  syncProjectDirectoryMembers,
} from "./project-directory-index";
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
  const stored = lastPath.trim();
  const remote = recoverRemoteAbs(stored);
  const out: WorkbenchProjectMeta = {
    lastPath: remote ?? normalizeWorkbenchPath(resolve(stored)),
  };
  if (typeof displayName === "string" && displayName.trim()) {
    out.displayName = displayName.trim();
  }
  if (remote && remote !== stored) {
    try {
      writeProjectSlotMeta(projectId, out, opts);
    } catch {
      // In-memory lastPath is already the remote:// URI.
    }
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
    lastPath: recoverRemoteAbs(meta.lastPath)
      ?? normalizeWorkbenchPath(resolve(meta.lastPath)),
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
  join = true,
): void {
  const existing = readProjectSlotMeta(projectId, opts);
  writeProjectSlotMeta(projectId, {
    lastPath,
    displayName: displayNameFor(lastPath, existing?.displayName),
  }, opts);
  const current = readWorkbenchHomeSettings(opts);
  const ids = [...current.workbenchProjectIds];
  if (join && !ids.includes(projectId)) ids.push(projectId);
  const nextDefault = defaultId ?? current.defaultProjectId ?? projectId;
  writeWorkbenchHomeSettings({
    defaultProjectId: nextDefault,
    workbenchProjectIds: [...new Set(ids)],
  }, opts);
  rememberProjectDirectory({
    projectId,
    lastPath,
    displayName: displayNameFor(lastPath, existing?.displayName),
  }, opts);
}

export function ensureDefaultProject(opts?: DefaultProjectOpts): DefaultProjectRef {
  ensureWorkbenchHome(opts);
  const settings = readWorkbenchHomeSettings(opts);
  const joinExisting = Boolean(
    settings.defaultProjectId
    && settings.workbenchProjectIds.includes(settings.defaultProjectId),
  );
  if (settings.defaultProjectId) {
    const meta = readProjectSlotMeta(settings.defaultProjectId, opts);
    if (meta?.lastPath) {
      if (isRemoteProjectRoot(meta.lastPath)) {
        rememberMember(
          settings.defaultProjectId,
          meta.lastPath,
          opts,
          settings.defaultProjectId,
          joinExisting,
        );
        return { projectId: settings.defaultProjectId, lastPath: meta.lastPath };
      }
      mkdirSync(meta.lastPath, { recursive: true });
      scaffoldWorkbenchProject(meta.lastPath, settings.defaultProjectId);
      rememberMember(
        settings.defaultProjectId,
        meta.lastPath,
        opts,
        settings.defaultProjectId,
        joinExisting,
      );
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
    rememberMember(
      settings.defaultProjectId,
      rebound,
      opts,
      settings.defaultProjectId,
      joinExisting,
    );
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

export function registerRemoteWorkbenchProject(
  input: { projectId: string; lastPath: string; displayName?: string },
  opts?: DefaultProjectOpts,
): WorkbenchState {
  if (!isRemoteProjectRoot(input.lastPath)) {
    throw new Error("not_a_remote_project_root");
  }
  rememberMember(input.projectId, input.lastPath, opts);
  if (input.displayName?.trim()) {
    writeProjectSlotMeta(input.projectId, {
      lastPath: input.lastPath,
      displayName: input.displayName.trim(),
    }, opts);
  }
  return getWorkbenchState(opts);
}

export function syncWorkbenchRegisteredRoots(opts?: DefaultProjectOpts): void {
  try {
    replaceRegisteredRoots(
      listWorkbenchMembers(opts)
        .map((member) => member.lastPath)
        .filter((lastPath) => !isRemoteProjectRoot(lastPath)),
    );
  } catch {
    // Missing home / tests without a real user home.
  }
}

export function openWorkbenchFolder(absPath: string, opts?: DefaultProjectOpts): DefaultProjectRef {
  const trimmed = absPath.trim();
  if (recoverRemoteAbs(trimmed)) {
    throw new Error("remote_project_root_is_not_local");
  }
  const lastPath = normalizeWorkbenchPath(resolve(trimmed));
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

export function setProjectDisplayName(
  projectId: string,
  displayName: string,
  opts?: DefaultProjectOpts,
): WorkbenchState {
  const id = projectId.trim();
  if (!id) throw new Error("missing_project_id");
  const meta = readProjectSlotMeta(id, opts);
  if (!meta?.lastPath) throw new Error(`unknown_project:${id}`);
  writeProjectSlotMeta(id, {
    lastPath: meta.lastPath,
    displayName: displayName.trim() || undefined,
  }, opts);
  return getWorkbenchState(opts);
}

export function reorderWorkbenchProjects(
  projectIds: readonly string[],
  opts?: DefaultProjectOpts,
): WorkbenchState {
  const settings = readWorkbenchHomeSettings(opts);
  const current = [...new Set(settings.workbenchProjectIds.map((id) => id.trim()).filter(Boolean))];
  const next = [...new Set(projectIds.map((id) => id.trim()).filter(Boolean))];
  if (!sameIdSet(current, next)) throw new Error("workbench_order_mismatch");
  writeWorkbenchHomeSettings({
    defaultProjectId: settings.defaultProjectId,
    workbenchProjectIds: next,
  }, opts);
  return getWorkbenchState(opts);
}

export function removeWorkbenchProject(projectId: string, opts?: DefaultProjectOpts): WorkbenchState {
  const id = projectId.trim();
  if (!id) throw new Error("missing_project_id");
  const settings = readWorkbenchHomeSettings(opts);
  const meta = readProjectSlotMeta(id, opts);
  if (meta?.lastPath) {
    rememberProjectDirectory({
      projectId: id,
      lastPath: meta.lastPath,
      displayName: displayNameFor(meta.lastPath, meta.displayName),
    }, opts);
  }
  markProjectDirectoryRemoved(id, opts);
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

/** Member lastPath, then `projectDirectoryById` (orphans after remove). */
export function resolveProjectLastPath(
  projectId: string,
  opts?: DefaultProjectOpts,
): string | null {
  const id = projectId.trim();
  if (!id) return null;
  const member = listWorkbenchMembers(opts).find((item) => item.id === id);
  if (member?.lastPath.trim()) return member.lastPath;
  return readProjectDirectory(opts)[id]?.lastPath.trim() || null;
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
  const settings = readWorkbenchHomeSettings(opts);
  const members = listWorkbenchMembers(opts);
  return {
    defaultProjectId: ref.projectId,
    defaultLastPath: ref.lastPath,
    workbenchProjectIds: settings.workbenchProjectIds,
    members,
    projectDirectoryById: syncProjectDirectoryMembers(members, opts),
  };
}
