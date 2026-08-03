/**
 * RightArea mode id → shortcut id (split-open chord shown in「+」menu & command palette).
 * Maximize variants stay in Shortcut settings / hints only.
 */
export const MODE_SHORTCUT: Partial<Record<string, string>> = {
  texworkspace: "workspace.openTexWorkspace",
  literature: "workspace.openLiterature",
  experiments: "workspace.openExperiments",
  files: "workspace.openFiles",
  git: "workspace.openGit",
  browser: "workspace.openBrowser",
  terminal: "workspace.openTerminal",
};

export function getModeShortcutId(modeId: string): string | undefined {
  return MODE_SHORTCUT[modeId];
}
