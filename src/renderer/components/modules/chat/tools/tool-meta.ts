import { resolvePermissionMode } from "@shared/permission-modes";

export type PermissionConfirmUx = "diff" | "command" | "patch" | "none";

export type PermissionGroup =
  | "file_write"
  | "shell"
  | "patch"
  | "read"
  | "network"
  | "interactive";

export interface ToolMeta {
  permissionGroup?: PermissionGroup;
  confirmUx: PermissionConfirmUx;
  /** Whether the tool feeds into changes-store proposed-change review */
  usesProposedChange?: boolean;
}

const DEFAULT_META: ToolMeta = { confirmUx: "none" };

const TOOL_META: Record<string, ToolMeta> = {
  edit: { permissionGroup: "file_write", confirmUx: "diff", usesProposedChange: true },
  write: { permissionGroup: "file_write", confirmUx: "diff", usesProposedChange: true },
  apply_patch: { permissionGroup: "patch", confirmUx: "patch" },
  patch: { permissionGroup: "patch", confirmUx: "patch" },
  bash: { permissionGroup: "shell", confirmUx: "command" },
  read: { permissionGroup: "read", confirmUx: "none" },
  grep: { permissionGroup: "read", confirmUx: "none" },
  glob: { permissionGroup: "read", confirmUx: "none" },
  list: { permissionGroup: "read", confirmUx: "none" },
  webfetch: { permissionGroup: "network", confirmUx: "none" },
  websearch: { permissionGroup: "network", confirmUx: "none" },
  question: { permissionGroup: "interactive", confirmUx: "none" },
  task: { confirmUx: "none" },
  skill: { confirmUx: "none" },
  todowrite: { confirmUx: "none" },
  plan: { confirmUx: "none" },
};

export function getToolMeta(toolName: string): ToolMeta {
  const key = toolName.toLowerCase();
  if (TOOL_META[key]) return TOOL_META[key];
  if (key.startsWith("lsp")) return { permissionGroup: "read", confirmUx: "none" };
  return DEFAULT_META;
}

export function usesProposedChange(toolName: string): boolean {
  return getToolMeta(toolName).usesProposedChange === true;
}

export function isFileWriteTool(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return n.startsWith("edit") || n.startsWith("write") || n.startsWith("multiedit");
}

export function isPatchTool(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return n === "patch" || n === "apply_patch" || n.startsWith("apply_patch");
}

/** Tools that mutate files on disk (edit/write/patch). Used for Auto-mode disk refresh. */
export function isDiskMutationTool(toolName: string): boolean {
  return isFileWriteTool(toolName) || isPatchTool(toolName);
}

/** Paths touched by a patch/apply_patch tool input. */
export function extractPatchTargetPaths(
  toolInput: Record<string, unknown> | undefined | null,
): string[] {
  if (!toolInput || typeof toolInput !== "object") return [];
  const paths: string[] = [];
  const direct = toolInput.file_path ?? toolInput.filePath ?? toolInput.path;
  if (typeof direct === "string" && direct.trim()) paths.push(direct.trim());

  const patchContent = toolInput.patch ?? toolInput.content;
  if (typeof patchContent !== "string" || !patchContent) {
    return [...new Set(paths)];
  }

  for (const line of patchContent.split("\n")) {
    if (line.startsWith("+++ ")) {
      const raw = line.slice(4).trim();
      const path = raw.replace(/^b\//, "").split("\t")[0]?.trim();
      if (path && path !== "/dev/null") paths.push(path);
    } else if (line.startsWith("diff --git ")) {
      const m = line.match(/^diff --git a\/(.+?) b\//);
      if (m?.[1]) paths.push(m[1]);
    }
  }
  return [...new Set(paths)];
}

/** Proposed-change review (Accept/Reject) is Ask-mode only. Auto applies edits directly. */
export function shouldTrackProposedChange(
  permissionMode: string | undefined,
  toolName: string,
): boolean {
  return resolvePermissionMode(permissionMode) === "ask" && isFileWriteTool(toolName);
}
