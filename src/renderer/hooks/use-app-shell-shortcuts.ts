import { useEffect } from "react";
import { pressLeftNav } from "@/lib/workspace/left-nav";
import { toggleLeftSidebarPanel } from "@/lib/workspace/left-sidebar-panel";
import { saveActiveWorkspaceFile } from "@/lib/workspace/save-active-workspace-file";
import {
  toggleRightArea,
  toggleMaximizedRightArea,
} from "@/lib/workspace/right-area-layout";
import {
  chordMatchesEvent,
  detectShortcutPlatform,
  resolveChord,
} from "../../shared/shortcuts";
import { eventTargetInCodeMirror } from "@/lib/editor/keymap";
import { useLayoutStore } from "@/stores/layout-store";
import { useSettingsStore } from "@/stores/settings-store";

function matchesShortcut(id: string, e: KeyboardEvent): boolean {
  const overrides = useSettingsStore.getState().settings.shortcutOverrides;
  const resolved = resolveChord(id, overrides);
  if (!resolved) return false;
  return chordMatchesEvent(resolved.chord, e, detectShortcutPlatform());
}

/**
 * App-shell shortcuts (registry-driven):
 * - shell.toggleLeftSidebar
 * - shell.toggleRightArea
 * - shell.toggleRightAreaMaximize
 * - shell.openSettings
 * - shell.commandPalette
 * - shell.saveFile
 */
export function useAppShellShortcuts(options?: { isMobile?: boolean }) {
  const isMobile = options?.isMobile;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey) return;

      if (matchesShortcut("shell.saveFile", e)) {
        if (saveActiveWorkspaceFile()) {
          e.preventDefault();
        }
        return;
      }

      // Same chord as editor.bold — editor wins when CodeMirror has focus.
      if (matchesShortcut("shell.toggleLeftSidebar", e)) {
        if (eventTargetInCodeMirror(e.target)) return;
        e.preventDefault();
        toggleLeftSidebarPanel();
        return;
      }

      // Check maximize (⌃⌘B) before split toggle (⌥⌘B).
      if (matchesShortcut("shell.toggleRightAreaMaximize", e)) {
        e.preventDefault();
        if (useLayoutStore.getState().leftSidebarView === "settings") return;
        toggleMaximizedRightArea();
        return;
      }

      if (matchesShortcut("shell.toggleRightArea", e)) {
        e.preventDefault();
        if (useLayoutStore.getState().leftSidebarView === "settings") return;
        toggleRightArea({ isMobile });
        return;
      }

      if (matchesShortcut("shell.openSettings", e)) {
        e.preventDefault();
        pressLeftNav("settings");
        return;
      }

      if (matchesShortcut("shell.commandPalette", e)) {
        e.preventDefault();
        const st = useLayoutStore.getState();
        st.setCommandPaletteOpen(!st.commandPaletteOpen);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobile]);
}
