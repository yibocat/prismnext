import { app } from "electron";
import { join } from "node:path";

/**
 * File-bridge roots for OpenCode custom tools ↔ Electron main.
 *
 * Lives under `<userData>/opencode-server/bridges/` — same app-level tree as
 * the OpenCode child process (not project `.prismnext/`, not `~/`).
 *
 * Absolute paths are injected into the OpenCode env at spawn; tools resolve
 * via env (or XDG_DATA_HOME fallback — also set to opencode-server).
 */
function getOpencodeServerDir(): string {
  return join(app.getPath("userData"), "opencode-server");
}

/** Parent directory for all OpenCode ↔ Electron file bridges. */
export function getPrismBridgeRoot(): string {
  return process.env.PRISM_BRIDGE_ROOT || join(getOpencodeServerDir(), "bridges");
}

export function getTerminalBridgeRoot(): string {
  return process.env.PRISM_TERMINAL_BRIDGE_ROOT || join(getPrismBridgeRoot(), "terminal");
}

export function getLiteratureBridgeRoot(): string {
  return process.env.PRISM_LITERATURE_BRIDGE_ROOT || join(getPrismBridgeRoot(), "literature");
}

export function getLatexBridgeRoot(): string {
  return process.env.PRISM_LATEX_BRIDGE_ROOT || join(getPrismBridgeRoot(), "latex");
}

export function getQuestionsBridgeRoot(): string {
  return process.env.PRISM_QUESTIONS_BRIDGE_ROOT || join(getPrismBridgeRoot(), "questions");
}

export function getResearchBriefBridgeRoot(): string {
  return process.env.PRISM_RESEARCH_BRIEF_BRIDGE_ROOT || join(getPrismBridgeRoot(), "research-brief");
}

export function getExperimentLogBridgeRoot(): string {
  return process.env.PRISM_EXPERIMENT_LOG_BRIDGE_ROOT || join(getPrismBridgeRoot(), "experiment-log");
}

/** Inject into OpenCode child env so synced tools use the same paths as main. */
export function getPrismBridgeEnv(): Record<string, string> {
  return {
    PRISM_BRIDGE_ROOT: getPrismBridgeRoot(),
    PRISM_TERMINAL_BRIDGE_ROOT: getTerminalBridgeRoot(),
    PRISM_LITERATURE_BRIDGE_ROOT: getLiteratureBridgeRoot(),
    PRISM_LATEX_BRIDGE_ROOT: getLatexBridgeRoot(),
    PRISM_QUESTIONS_BRIDGE_ROOT: getQuestionsBridgeRoot(),
    PRISM_RESEARCH_BRIEF_BRIDGE_ROOT: getResearchBriefBridgeRoot(),
    PRISM_EXPERIMENT_LOG_BRIDGE_ROOT: getExperimentLogBridgeRoot(),
  };
}
