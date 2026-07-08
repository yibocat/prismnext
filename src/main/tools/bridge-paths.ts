/**
 * Shared bridge path helpers for OpenCode custom tools (Bun runtime).
 * NOT an OpenCode tool — no default export. Copied to opencode/tools/ by syncBuiltinTools.
 *
 * Keep logic in sync with src/main/services/prism-bridge-paths.ts
 *
 * Production: main injects PRISM_*_BRIDGE_ROOT at `opencode acp` spawn.
 * Fallback: XDG_DATA_HOME is also set to `<userData>/opencode-server`.
 */
import * as path from "path";

function bridgeRoot(): string {
  if (process.env.PRISM_BRIDGE_ROOT) return process.env.PRISM_BRIDGE_ROOT;
  const dataHome = process.env.XDG_DATA_HOME;
  if (dataHome) return path.join(dataHome, "bridges");
  throw new Error("PRISM_BRIDGE_ROOT or XDG_DATA_HOME must be set for Prism bridge tools");
}

export function terminalBridgeRoot(): string {
  return process.env.PRISM_TERMINAL_BRIDGE_ROOT || path.join(bridgeRoot(), "terminal");
}

export function literatureBridgeRoot(): string {
  return process.env.PRISM_LITERATURE_BRIDGE_ROOT || path.join(bridgeRoot(), "literature");
}

export function latexBridgeRoot(): string {
  return process.env.PRISM_LATEX_BRIDGE_ROOT || path.join(bridgeRoot(), "latex");
}

export function questionsBridgeRoot(): string {
  return process.env.PRISM_QUESTIONS_BRIDGE_ROOT || path.join(bridgeRoot(), "questions");
}

export function researchBriefBridgeRoot(): string {
  return process.env.PRISM_RESEARCH_BRIEF_BRIDGE_ROOT || path.join(bridgeRoot(), "research-brief");
}

export function experimentLogBridgeRoot(): string {
  return process.env.PRISM_EXPERIMENT_LOG_BRIDGE_ROOT || path.join(bridgeRoot(), "experiment-log");
}
