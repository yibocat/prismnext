import { useEffect, type RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { pressLeftNav } from "@/lib/workspace/left-nav";
import { toggleLeftSidebarPanel } from "@/lib/workspace/left-sidebar-panel";
import { saveActiveWorkspaceFile } from "@/lib/workspace/save-active-workspace-file";
import {
  openRightArea,
  closeRightArea,
  toggleRightAreaMaximize,
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
export function useAppShellShortcuts(
  panelRefs: {
    leftSidebarRef: RefObject<PanelImperativeHandle | null>;
    centerRef: RefObject<PanelImperativeHandle | null>;
    rightAreaRef: RefObject<PanelImperativeHandle | null>;
  },
  options?: { isMobile?: boolean },
) {
  const { leftSidebarRef, centerRef, rightAreaRef } = panelRefs;
  const isMobile = options?.isMobile;

  useEffect(() => {
    const layoutCtx = () => ({
      centerRef: centerRef.current,
      rightAreaRef: rightAreaRef.current,
      leftSidebarRef: leftSidebarRef.current,
      isMobile,
    });

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
        toggleLeftSidebarPanel(leftSidebarRef);
        return;
      }

      // Check maximize (⌘⇧J) before toggle (⌘J).
      if (matchesShortcut("shell.toggleRightAreaMaximize", e)) {
        e.preventDefault();
        toggleRightAreaMaximize(layoutCtx());
        return;
      }

      if (matchesShortcut("shell.toggleRightArea", e)) {
        e.preventDefault();
        const r = rightAreaRef.current;
        if (!r) return;
        if (r.isCollapsed()) {
          openRightArea(layoutCtx());
        } else {
          closeRightArea({
            centerRef: centerRef.current,
            rightAreaRef: r,
          });
        }
        return;
      }

      if (matchesShortcut("shell.openSettings", e)) {
        e.preventDefault();
        pressLeftNav("settings", {
          panelRefs: { centerRef, rightAreaRef },
        });
        return;
      }

      if (matchesShortcut("shell.commandPalette", e)) {
        e.preventDefault();
        useLayoutStore.getState().setCommandPaletteOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [leftSidebarRef, centerRef, rightAreaRef, isMobile]);
}
