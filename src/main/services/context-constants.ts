// prism-next/src/main/services/context-constants.ts
// Context-window display constants — owned by the agent / system-prompt assembly path.

/** Fallback context window size when model metadata is unavailable (128K tokens). */
export const DEFAULT_CONTEXT_WINDOW = 128_000;

/** Parse a context-window label string into a numeric token count.
 *  Supports: "200K" / "1M" / "2M" (suffix), "128000" (plain number).
 *  Returns `DEFAULT_CONTEXT_WINDOW` for unrecognized formats. */
export function parseContextWindow(label?: string | null): number {
  if (!label) return DEFAULT_CONTEXT_WINDOW;
  const trimmed = label.trim();
  // Suffix form: "200K", "1M", "0.5M"
  const suffixMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(K|M)$/i);
  if (suffixMatch) {
    const value = parseFloat(suffixMatch[1]);
    const unit = suffixMatch[2].toUpperCase();
    if (unit === "M") return Math.round(value * 1_000_000);
    if (unit === "K") return Math.round(value * 1_000);
  }
  // Plain number: "128000", "200000"
  const plainMatch = trimmed.match(/^(\d+)$/);
  if (plainMatch) {
    return parseInt(plainMatch[1], 10);
  }
  return DEFAULT_CONTEXT_WINDOW;
}

/** Category schema for the context-window breakdown panel.
 *  Each entry maps to a component of the assembled system prompt
 *  plus the conversation itself. */
export interface ContextCategoryDef {
  key: string;
  label: string;
  color: string;
  description?: string;
  order: number;
}

export const CONTEXT_CATEGORY_SCHEMA: ContextCategoryDef[] = [
  { key: "messages",             label: "Messages",             color: "bg-rose-400",   description: "Chat messages and tool call results",              order: 0 },
  { key: "user-instructions",    label: "User Instructions",    color: "bg-purple-500", description: "Custom system prompt from app settings",         order: 1 },
  { key: "project-instructions", label: "Project Instructions", color: "bg-amber-500", description: "AGENTS.md — per-project agent instructions",     order: 2 },
  { key: "project-rules",        label: "Project Rules",        color: "bg-yellow-500", description: "Custom rules from RULE.md files",                order: 3 },
  { key: "skills",               label: "Skills",               color: "bg-cyan-500",   description: "Agent skills (.prismnext/agent/skills/)",        order: 4 },
  { key: "modules",              label: "Prompt Modules",       color: "bg-emerald-500", description: "Domain-specific knowledge modules",             order: 5 },
  { key: "mcp-tools",            label: "MCP Tools",            color: "bg-orange-500", description: "MCP server tool definitions",                    order: 6 },
  { key: "core-persona",         label: "Core Persona",         color: "bg-blue-500",   description: "Prism built-in agent role and behavior rules",   order: 7 },
  { key: "agent-base",           label: "Agent Base",           color: "bg-slate-400",  description: "OpenCode built-in system prompt & tool defs",    order: 8 },
];
