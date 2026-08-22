import { getToolPermissionEntry } from "@shared/permissions/tool-registry";

export function usesProposedChange(toolName: string): boolean {
  return getToolPermissionEntry(toolName)?.usesProposedChange === true;
}
