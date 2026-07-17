import { useEffect } from "react";
import {
  chordMatchesEvent,
  detectShortcutPlatform,
  resolveChord,
} from "../../shared/shortcuts";
import { eventTargetInCodeMirror } from "@/lib/editor/keymap";
import { pressLeftNav } from "@/lib/workspace/left-nav";
import { getLeftNavPanelRefs } from "@/lib/workspace/left-nav/panel-refs";
import { compileCurrentDocument } from "@/stores/compile-store";
import { useChatStore } from "@/stores/chat-store";
import { useChangesStore } from "@/stores/changes-store";
import { useComposerEditorStore } from "@/stores/composer-editor-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useSettingsStore } from "@/stores/settings-store";

function matchesShortcut(id: string, e: KeyboardEvent): boolean {
  const overrides = useSettingsStore.getState().settings.shortcutOverrides;
  const resolved = resolveChord(id, overrides);
  if (!resolved) return false;
  return chordMatchesEvent(resolved.chord, e, detectShortcutPlatform());
}

function cycleChatTab(delta: 1 | -1): boolean {
  const { tabs, activeTabId, setActiveTab } = useChatStore.getState();
  if (tabs.length < 2) return false;
  const idx = Math.max(0, tabs.findIndex((t) => t.id === activeTabId));
  const next = tabs[(idx + delta + tabs.length) % tabs.length];
  if (!next || next.id === activeTabId) return false;
  setActiveTab(next.id);
  return true;
}

/**
 * Product shortcuts (registry-driven):
 * - product.focusAiBar — focus chat composer (panel); AiBar owns chord when maximized
 * - product.newChat
 * - product.nextChat / product.prevChat
 * - product.compile
 * - product.acceptAll / product.rejectAll
 *
 * Single accept/reject (product.acceptChange / rejectChange) stay in the editor host.
 */
export function useProductShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey) return;

      // ⌘I → focus Chat composer. Skip when maximized (AiBar capture handler) or
      // when CodeMirror has focus (editor.italic wins).
      if (matchesShortcut("product.focusAiBar", e)) {
        if (useLayoutStore.getState().editorMaximized) return;
        if (eventTargetInCodeMirror(e.target)) return;
        e.preventDefault();
        const layout = useLayoutStore.getState();
        layout.setLeftSidebarView("sessions");
        layout.requestCenterExpand();
        requestAnimationFrame(() => {
          useComposerEditorStore.getState().handle?.focus();
        });
        return;
      }

      if (matchesShortcut("product.newChat", e)) {
        e.preventDefault();
        pressLeftNav("new-agent", { panelRefs: getLeftNavPanelRefs() });
        return;
      }

      if (matchesShortcut("product.nextChat", e)) {
        if (cycleChatTab(1)) e.preventDefault();
        return;
      }

      if (matchesShortcut("product.prevChat", e)) {
        if (cycleChatTab(-1)) e.preventDefault();
        return;
      }

      if (matchesShortcut("product.compile", e)) {
        e.preventDefault();
        void compileCurrentDocument();
        return;
      }

      if (matchesShortcut("product.acceptAll", e)) {
        const { changes, acceptAll } = useChangesStore.getState();
        if (changes.length === 0) return;
        e.preventDefault();
        void acceptAll();
        return;
      }

      if (matchesShortcut("product.rejectAll", e)) {
        const { changes, rejectAll } = useChangesStore.getState();
        if (changes.length === 0) return;
        e.preventDefault();
        void rejectAll();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
