/**
 * Verbs the host already owns. Bash must not impersonate them.
 * Detectors stay in their own files; this table is the only entry.
 */

import { isDisplayRasterBashCommand, displayRasterBashBlockMessage } from "./display-raster-bash";
import { isFileRmBashCommand, fileRmBashBlockMessage } from "./file-rm-bash";
import { isDirectLatexCompileBashCommand, latexCompileBashBlockMessage } from "./latex-compile-bash";
import { TOOL_NAMES } from "./tool-names";

export type ReservedOpId = "latex_compile" | "file_delete" | "present_substitute";

export interface ReservedOpHit {
  id: ReservedOpId;
  hostTool: string | null;
  message: string;
}

export interface ReservedOpRow {
  id: ReservedOpId;
  hostTool: string | null;
  match: (command: string) => boolean;
  message: () => string;
  /**
   * Gate hard-deny only for these tool names.
   * Omitted = any shell-ish tool that reached the reserved check (bash + experiment-run).
   * Smart policy still denies any hit (command-only).
   */
  gateTools?: readonly string[];
}

export const RESERVED_BASH_OPS: readonly ReservedOpRow[] = [
  {
    id: "latex_compile",
    hostTool: TOOL_NAMES.latexCompile,
    match: isDirectLatexCompileBashCommand,
    message: latexCompileBashBlockMessage,
  },
  {
    id: "file_delete",
    hostTool: TOOL_NAMES.delete,
    match: isFileRmBashCommand,
    message: fileRmBashBlockMessage,
    gateTools: ["bash"],
  },
  {
    id: "present_substitute",
    hostTool: null,
    match: isDisplayRasterBashCommand,
    message: displayRasterBashBlockMessage,
    gateTools: ["bash"],
  },
];

export function matchReservedOpRows(
  command: string,
  rows: readonly ReservedOpRow[],
): ReservedOpHit | null {
  const c = command.trim();
  if (!c) return null;
  for (const row of rows) {
    if (!row.match(c)) continue;
    return { id: row.id, hostTool: row.hostTool, message: row.message() };
  }
  return null;
}

export function matchReservedBashOp(command: string): ReservedOpHit | null {
  return matchReservedOpRows(command, RESERVED_BASH_OPS);
}

export function reservedOpIsGateHardDeny(hit: ReservedOpHit, toolName: string): boolean {
  const row = RESERVED_BASH_OPS.find((item) => item.id === hit.id);
  if (!row) return false;
  if (!row.gateTools) return true;
  return row.gateTools.includes(toolName.toLowerCase());
}

export function matchReservedGateOp(command: string, toolName: string): ReservedOpHit | null {
  const hit = matchReservedBashOp(command);
  if (!hit) return null;
  return reservedOpIsGateHardDeny(hit, toolName) ? hit : null;
}
