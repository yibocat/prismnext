/**
 * Unified Native Tool Catalog for PrismNext Pi Agent Host.
 *
 * Host research / interactive tools. File and shell primitives come from Pi.
 */

export * from "./types";
export * from "./literature";
export * from "./latex";
export * from "./research-brief";
export * from "./experiment";
export * from "./interaction";
export * from "./system";
export * from "./interactive";

import { LITERATURE_TOOLS } from "./literature";
import { LATEX_TOOLS } from "./latex";
import { RESEARCH_BRIEF_TOOLS } from "./research-brief";
import { EXPERIMENT_TOOLS } from "./experiment";
import { INTERACTION_TOOLS } from "./interaction";
import { SYSTEM_TOOLS } from "./system";
import { INTERACTIVE_TOOLS } from "./interactive";
import type { NativeToolDefinition } from "./types";

export const ALL_NATIVE_TOOLS: readonly NativeToolDefinition[] = [
  ...LITERATURE_TOOLS,
  ...LATEX_TOOLS,
  ...RESEARCH_BRIEF_TOOLS,
  ...EXPERIMENT_TOOLS,
  ...INTERACTION_TOOLS,
  ...SYSTEM_TOOLS,
  ...INTERACTIVE_TOOLS,
];

export function getNativeToolByName(name: string): NativeToolDefinition | undefined {
  const target = name.trim().toLowerCase();
  return ALL_NATIVE_TOOLS.find((t) => t.name.toLowerCase() === target);
}
