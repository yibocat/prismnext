/**
 * Unified Native Tool Contract for PrismNext Pi Agent Host.
 *
 * Self-describes metadata, TypeBox schema, permission rules, and execution handler.
 */

import type { TSchema } from "@earendil-works/pi-ai";
import type { ToolExecuteContext } from "../tool-host";

export type ToolPermissionCategory =
  | "read_only"
  | "safe_write"
  | "destructive"
  | "shell_exec";

export interface ExtractedPathContext {
  filePath?: string | null;
  sourcePath?: string | null;
  destinationPath?: string | null;
}

export interface ExtractedBashContext {
  command: string;
  cwd?: string;
}

export interface ToolPermissionDeclaration {
  category: ToolPermissionCategory;
  extractPath?: (
    args: Record<string, unknown>,
    projectRoot: string,
  ) => ExtractedPathContext | string | null | undefined;
  extractBash?: (
    args: Record<string, unknown>,
    projectRoot: string,
  ) => ExtractedBashContext | null | undefined;
}

export interface NativeToolDefinition<TParams extends TSchema = TSchema> {
  name: string;
  label: string;
  description: string;
  parameters: TParams;
  permission: ToolPermissionDeclaration;
  execute: (args: Record<string, any>, ctx: ToolExecuteContext) => Promise<unknown>;
}
