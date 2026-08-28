import { useEffect } from "react";
import {
  chordMatchesEvent,
  detectShortcutPlatform,
  resolveChord,
} from "../../shared/shortcuts";
import {
  toggleExperimentsMaximize,
  toggleExperimentsSplit,
  toggleFilesMaximize,
  toggleFilesSplit,
  toggleLiteratureMaximize,
  toggleLiteratureSplit,
} from "@/lib/workspace/left-nav/panel-utils";
import {
  openModeMaximized,
  openModeInSplit,
} from "@/lib/workspace/toolbar-mode-open";
import { useSettingsStore } from "@/stores/settings-store";
import { useLayoutStore } from "@/stores/layout-store";

function matchesShortcut(id: string, e: KeyboardEvent): boolean {
  const overrides = useSettingsStore.getState().settings.shortcutOverrides;
  const resolved = resolveChord(id, overrides);
  if (!resolved) return false;
  return chordMatchesEvent(resolved.chord, e, detectShortcutPlatform());
}

/**
 * Workspace mode shortcuts (Control on all platforms — avoids macOS ⌘⇧ screenshot):
 * - Files / Library / Experiments: Ctrl+1–3 (+ Shift = maximize)
 *   (`workspace.openTexWorkspace*` ids still exist; they open Files)
 * - Files (Ctrl+4) / Git / Browser: Ctrl+4–6 (+ Shift = maximize)
 * - Terminal: Ctrl+` (+ Shift = maximize) — VS Code-style
 * - Templates: no shortcut
 */
export function useWorkspaceModeShortcuts(options?: { isMobile?: boolean }) {
  const isMobile = options?.isMobile;

  useEffect(() => {
    const layout = { isMobile };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey) return;
      if (useLayoutStore.getState().leftSidebarView === "settings") return;

      // LeftNav modes (Shift before bare).
      if (matchesShortcut("workspace.openTexWorkspaceMaximize", e)) {
        e.preventDefault();
        toggleFilesMaximize();
        return;
      }
      if (matchesShortcut("workspace.openTexWorkspace", e)) {
        e.preventDefault();
        toggleFilesSplit(layout);
        return;
      }
      if (matchesShortcut("workspace.openLiteratureMaximize", e)) {
        e.preventDefault();
        toggleLiteratureMaximize();
        return;
      }
      if (matchesShortcut("workspace.openLiterature", e)) {
        e.preventDefault();
        toggleLiteratureSplit(layout);
        return;
      }
      if (matchesShortcut("workspace.openExperimentsMaximize", e)) {
        e.preventDefault();
        toggleExperimentsMaximize();
        return;
      }
      if (matchesShortcut("workspace.openExperiments", e)) {
        e.preventDefault();
        toggleExperimentsSplit(layout);
        return;
      }

      // Toolbar modes.
      if (matchesShortcut("workspace.openFilesMaximize", e)) {
        e.preventDefault();
        openModeMaximized("files", layout);
        return;
      }
      if (matchesShortcut("workspace.openFiles", e)) {
        e.preventDefault();
        openModeInSplit("files", layout);
        return;
      }
      if (matchesShortcut("workspace.openGitMaximize", e)) {
        e.preventDefault();
        openModeMaximized("git", layout);
        return;
      }
      if (matchesShortcut("workspace.openGit", e)) {
        e.preventDefault();
        openModeInSplit("git", layout);
        return;
      }
      if (matchesShortcut("workspace.openBrowserMaximize", e)) {
        e.preventDefault();
        openModeMaximized("browser", layout);
        return;
      }
      if (matchesShortcut("workspace.openBrowser", e)) {
        e.preventDefault();
        openModeInSplit("browser", layout);
        return;
      }
      if (matchesShortcut("workspace.openTerminalMaximize", e)) {
        e.preventDefault();
        openModeMaximized("terminal", layout);
        return;
      }
      if (matchesShortcut("workspace.openTerminal", e)) {
        e.preventDefault();
        openModeInSplit("terminal", layout);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobile]);
}
