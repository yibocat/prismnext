export type {
  PermissionConfirmUx,
  PermissionGroup,
  ToolPermissionEntry,
} from "@shared/tool-permission-registry";
export {
  TOOL_PERMISSION_REGISTRY,
  getToolPermissionEntry,
  buildPermissionRulesForMode,
} from "@shared/tool-permission-registry";

import { getToolPermissionEntry } from "@shared/tool-permission-registry";

export interface ToolMeta {
  permissionGroup?: import("@shared/tool-permission-registry").PermissionGroup;
  confirmUx: import("@shared/tool-permission-registry").PermissionConfirmUx;
  usesProposedChange?: boolean;
}

const DEFAULT_META: ToolMeta = { confirmUx: "none" };

export function getToolMeta(toolName: string): ToolMeta {
  const entry = getToolPermissionEntry(toolName);
  if (!entry) return DEFAULT_META;
  return {
    permissionGroup: entry.permissionGroup,
    confirmUx: entry.confirmUx,
    usesProposedChange: entry.usesProposedChange,
  };
}

export function usesProposedChange(toolName: string): boolean {
  return getToolMeta(toolName).usesProposedChange === true;
}

export function isFileWriteTool(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return n.startsWith("edit") || n.startsWith("write");
}

export function isPatchTool(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return n === "apply_patch" || n.startsWith("apply_patch");
}

/** Tools that mutate files on disk (edit/write/patch). Used for Auto-mode disk refresh. */
export function isDiskMutationTool(toolName: string): boolean {
  const entry = getToolPermissionEntry(toolName);
  if (entry?.diskMutation) return true;
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
