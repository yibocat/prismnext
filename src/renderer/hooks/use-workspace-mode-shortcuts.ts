import { useEffect, type RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import {
  chordMatchesEvent,
  detectShortcutPlatform,
  resolveChord,
} from "../../shared/shortcuts";
import {
  toggleExperimentsMaximize,
  toggleExperimentsSplit,
  toggleLiteratureMaximize,
  toggleLiteratureSplit,
  toggleTexWorkspaceMaximize,
  toggleTexWorkspaceSplit,
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

type PanelRefs = {
  leftSidebarRef: RefObject<PanelImperativeHandle | null>;
  centerRef: RefObject<PanelImperativeHandle | null>;
  rightAreaRef: RefObject<PanelImperativeHandle | null>;
};

/**
 * Workspace mode shortcuts (Control on all platforms — avoids macOS ⌘⇧ screenshot):
 * - TeX / Library / Experiments: Ctrl+1–3 (+ Shift = maximize)
 * - Files / Git / Browser: Ctrl+4–6 (+ Shift = maximize)
 * - Terminal: Ctrl+` (+ Shift = maximize) — VS Code-style
 * - Templates: no shortcut
 */
export function useWorkspaceModeShortcuts(
  panelRefs: PanelRefs,
  options?: { isMobile?: boolean },
) {
  const { leftSidebarRef, centerRef, rightAreaRef } = panelRefs;
  const isMobile = options?.isMobile;

  useEffect(() => {
    const navCtx = () => ({
      panelRefs: { centerRef, rightAreaRef },
    });
    const layoutCtx = () => ({
      centerRef: centerRef.current,
      rightAreaRef: rightAreaRef.current,
      leftSidebarRef: leftSidebarRef.current,
      isMobile,
    });
    const splitLayout = () => ({
      leftSidebarRef: leftSidebarRef.current,
      isMobile,
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey) return;
      if (useLayoutStore.getState().leftSidebarView === "settings") return;

      // LeftNav modes (Shift before bare).
      if (matchesShortcut("workspace.openTexWorkspaceMaximize", e)) {
        e.preventDefault();
        toggleTexWorkspaceMaximize(navCtx());
        return;
      }
      if (matchesShortcut("workspace.openTexWorkspace", e)) {
        e.preventDefault();
        toggleTexWorkspaceSplit(navCtx(), splitLayout());
        return;
      }
      if (matchesShortcut("workspace.openLiteratureMaximize", e)) {
        e.preventDefault();
        toggleLiteratureMaximize(navCtx());
        return;
      }
      if (matchesShortcut("workspace.openLiterature", e)) {
        e.preventDefault();
        toggleLiteratureSplit(navCtx(), splitLayout());
        return;
      }
      if (matchesShortcut("workspace.openExperimentsMaximize", e)) {
        e.preventDefault();
        toggleExperimentsMaximize(navCtx());
        return;
      }
      if (matchesShortcut("workspace.openExperiments", e)) {
        e.preventDefault();
        toggleExperimentsSplit(navCtx(), splitLayout());
        return;
      }

      // Toolbar modes.
      if (matchesShortcut("workspace.openFilesMaximize", e)) {
        e.preventDefault();
        openModeMaximized("files", layoutCtx());
        return;
      }
      if (matchesShortcut("workspace.openFiles", e)) {
        e.preventDefault();
        openModeInSplit("files", layoutCtx());
        return;
      }
      if (matchesShortcut("workspace.openGitMaximize", e)) {
        e.preventDefault();
        openModeMaximized("git", layoutCtx());
        return;
      }
      if (matchesShortcut("workspace.openGit", e)) {
        e.preventDefault();
        openModeInSplit("git", layoutCtx());
        return;
      }
      if (matchesShortcut("workspace.openBrowserMaximize", e)) {
        e.preventDefault();
        openModeMaximized("browser", layoutCtx());
        return;
      }
      if (matchesShortcut("workspace.openBrowser", e)) {
        e.preventDefault();
        openModeInSplit("browser", layoutCtx());
        return;
      }
      if (matchesShortcut("workspace.openTerminalMaximize", e)) {
        e.preventDefault();
        openModeMaximized("terminal", layoutCtx());
        return;
      }
      if (matchesShortcut("workspace.openTerminal", e)) {
        e.preventDefault();
        openModeInSplit("terminal", layoutCtx());
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [leftSidebarRef, centerRef, rightAreaRef, isMobile]);
}
