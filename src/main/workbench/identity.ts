import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isRemoteProjectRoot } from "../../shared/remote";
import { workbenchJsonRel, normalizeWorkbenchPath } from "../../shared/workbench/paths";

const ID_HEX_BYTES = 10;

export function mintProjectId(): string {
  return `p_${randomBytes(ID_HEX_BYTES).toString("hex")}`;
}

export interface WorkbenchWorkspaceFolder {
  function: string;
  name: string;
  mainTex?: string;
  description?: string;
  icon?: string;
  customLabel?: string;
}

export interface WorkbenchWorkspace {
  folders?: WorkbenchWorkspaceFolder[];
  [key: string]: unknown;
}

export interface WorkbenchJson {
  id: string;
  workspace?: WorkbenchWorkspace;
}

function workbenchJsonAbs(projectRoot: string): string {
  return join(resolve(projectRoot), workbenchJsonRel());
}

export function readWorkbenchJson(projectRoot: string): WorkbenchJson | null {
  if (isRemoteProjectRoot(projectRoot)) return null;
  const file = workbenchJsonAbs(projectRoot);
  if (!existsSync(file)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const id = (raw as { id?: unknown }).id;
  if (typeof id !== "string" || id.trim().length === 0) return null;
  const workspace = (raw as { workspace?: unknown }).workspace;
  const out: WorkbenchJson = { id: id.trim() };
  if (workspace && typeof workspace === "object") {
    out.workspace = workspace as WorkbenchWorkspace;
  }
  return out;
}

export function ensureWorkbenchId(projectRoot: string): string {
  if (isRemoteProjectRoot(projectRoot)) {
    throw new Error("remote_project_root_is_not_local");
  }
  const existing = readWorkbenchJson(projectRoot);
  if (existing) return existing.id;
  const id = mintProjectId();
  writeWorkbenchJson(projectRoot, { id });
  return id;
}

export function writeWorkbenchJson(projectRoot: string, doc: WorkbenchJson): void {
  if (isRemoteProjectRoot(projectRoot)) {
    throw new Error("remote_project_root_is_not_local");
  }
  const id = doc.id?.trim();
  if (!id) throw new Error("workbench.json requires id");
  const payload: WorkbenchJson = { id };
  if (doc.workspace && typeof doc.workspace === "object") {
    payload.workspace = doc.workspace;
  }
  const file = workbenchJsonAbs(projectRoot);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export interface WorkbenchSlot {
  id: string;
  lastPath: string;
}

export type OpenFolderDecision =
  | { action: "mint"; id: string; reason: "no-json" }
  | { action: "mint"; id: string; reason: "second-live-copy"; previousId: string }
  | { action: "create-slot"; id: string }
  | { action: "reuse"; id: string }
  | { action: "rebind"; id: string };

export interface ResolveOpenFolderInput {
  absPath: string;
  workbenchId: string | null;
  slots: readonly WorkbenchSlot[];
  livePaths: Iterable<string>;
  mintId?: () => string;
}

function liveSet(livePaths: Iterable<string>): Set<string> {
  return new Set([...livePaths].map((p) => normalizeWorkbenchPath(resolve(p))));
}

export function resolveOpenFolder(input: ResolveOpenFolderInput): OpenFolderDecision {
  const here = normalizeWorkbenchPath(resolve(input.absPath));
  const mint = input.mintId ?? mintProjectId;
  const diskId = input.workbenchId?.trim() || null;

  if (!diskId) {
    return { action: "mint", id: mint(), reason: "no-json" };
  }

  const slot = input.slots.find((s) => s.id === diskId);
  if (!slot) {
    return { action: "create-slot", id: diskId };
  }

  const last = slot.lastPath?.trim()
    ? normalizeWorkbenchPath(resolve(slot.lastPath))
    : "";
  if (last && last === here) {
    return { action: "reuse", id: diskId };
  }

  const live = liveSet(input.livePaths);
  if (!last || !live.has(last)) {
    return { action: "rebind", id: diskId };
  }

  return {
    action: "mint",
    id: mint(),
    reason: "second-live-copy",
    previousId: diskId,
  };
}
