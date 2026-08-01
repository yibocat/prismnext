import { useEffect } from "react";
import {
  chordMatchesEvent,
  detectShortcutPlatform,
  resolveChord,
} from "../../shared/shortcuts";
import { cycleChatBackdrop } from "@/lib/chat/home-backdrops/resolve";
import { cycleThemePack } from "@/lib/theme/theme-packs";
import { pressLeftNav } from "@/lib/workspace/left-nav";
import { getLeftNavPanelRefs } from "@/lib/workspace/left-nav/panel-refs";
import { compileCurrentDocument } from "@/stores/compile-store";
import { useChatStore } from "@/stores/chat-store";
import { useChangesStore } from "@/stores/changes-store";
import { useComposerEditorStore } from "@/stores/composer-editor-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useThemeStore } from "@/stores/theme-store";
import { requestToggleModelPicker } from "@/lib/chat/open-model-picker";

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

const MESSAGE_WIDTH_ORDER = ["narrow", "balanced", "wide"] as const;
type MessageWidth = (typeof MESSAGE_WIDTH_ORDER)[number];

export function cycleMessageWidth(current: string | undefined): MessageWidth {
  const idx = current ? MESSAGE_WIDTH_ORDER.indexOf(current as MessageWidth) : -1;
  // Unknown value (or undefined) defaults to "balanced" so the next press
  // always lands on a defined tier.
  const safe = idx < 0 ? 1 : idx;
  return MESSAGE_WIDTH_ORDER[(safe + 1) % MESSAGE_WIDTH_ORDER.length];
}

/**
 * Product shortcuts (registry-driven):
 * - product.focusAiBar — focus chat composer (panel); AiBar owns chord when maximized
 * - product.newChat
 * - product.nextChat / product.prevChat
 * - product.compile
 * - product.acceptAll / product.rejectAll
 * - product.togglePlanMode — ⌥P / Alt+P
 * - product.openModelPicker — ⌥K / Alt+K
 * - product.cycleMessageWidth — ⌘L / Ctrl+L (pairs with focus-input)
 * - product.cycleThemePack — ⌥T / Alt+T
 * - product.cycleChatBackdrop — ⌥B / Alt+B
 * - workspace.insertToChat (hosts) — ⌥L / Alt+L
 *
 * Single accept/reject (product.acceptChange / rejectChange) stay in the editor host.
 */
export function useProductShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌥P / ⌥K must run before the alt-only early-return (macOS Option glyphs).
      if (matchesShortcut("product.togglePlanMode", e)) {
        const { activeTabId, tabs, requestSetSessionAgent } = useChatStore.getState();
        if (!activeTabId || !tabs.some((t) => t.id === activeTabId)) return;
        e.preventDefault();
        const agent = tabs.find((t) => t.id === activeTabId)?.sessionAgent ?? "build";
        requestSetSessionAgent(agent === "plan" ? "build" : "plan");
        return;
      }

      if (matchesShortcut("product.openModelPicker", e)) {
        e.preventDefault();
        requestToggleModelPicker();
        return;
      }

      if (matchesShortcut("product.cycleThemePack", e)) {
        e.preventDefault();
        const { themePack } = useThemeStore.getState().config;
        void useThemeStore.getState().updateConfig({ themePack: cycleThemePack(themePack) });
        return;
      }

      if (matchesShortcut("product.cycleChatBackdrop", e)) {
        e.preventDefault();
        const { settings, updateSettings } = useSettingsStore.getState();
        const themePack = useThemeStore.getState().config.themePack;
        const next = cycleChatBackdrop(
          settings.chatHomeBackdrop,
          settings.chatHomeBackdropEnabled,
          themePack,
        );
        void updateSettings({
          chatHomeBackdropEnabled: true,
          chatHomeBackdrop: next,
        });
        return;
      }

      if (e.altKey && !e.metaKey && !e.ctrlKey) return;

      // ⌘L / Ctrl+L → cycle chat message width (narrow → balanced → wide).
      if (matchesShortcut("product.cycleMessageWidth", e)) {
        const current = useSettingsStore.getState().settings.messageWidth;
        const next = cycleMessageWidth(current);
        e.preventDefault();
        void useSettingsStore.getState().updateSettings({ messageWidth: next });
        return;
      }

      // ⌘Z / Ctrl+Z → undo the most recent session rename on the active tab.
      // Skip when focus is in an editable element so the composer's native
      // undo behavior keeps working.
      if (matchesShortcut("product.undoRename", e)) {
        const active = document.activeElement as HTMLElement | null;
        const tag = active?.tagName;
        const editable =
          active?.isContentEditable ||
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT";
        if (editable) return;
        const { activeTabId, lastTitleByTab, undoRenameSession } = useChatStore.getState();
        if (!activeTabId || lastTitleByTab[activeTabId] === undefined) return;
        e.preventDefault();
        void undoRenameSession(activeTabId);
        return;
      }

      // ⌘I → focus Chat composer (or blur it if already focused — toggle).
      // Skip when maximized (AiBar capture handler) or when the LaTeX editor
      // has focus (editor.italic wins). The composer itself is also a CM
      // editor, so we exclude any CM nested inside [data-chat-composer].
      if (matchesShortcut("product.focusAiBar", e)) {
        if (useLayoutStore.getState().editorMaximized) return;
        const target = e.target as Element | null;
        if (
          target &&
          target.closest(".cm-editor") &&
          !target.closest("[data-chat-composer]")
        ) {
          return;
        }
        e.preventDefault();
        const active = document.activeElement as HTMLElement | null;
        if (active?.closest("[data-chat-composer]")) {
          // Composer already has focus — leave it.
          active.blur();
          return;
        }
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
