import { Bot, LayoutTemplate, Package, SettingsIcon } from "lucide-react";
import { ShortcutKbdChips } from "@/lib/shortcuts";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { resetSettingsEditors } from "@/stores/settings-panel-store";
import { leftNavRegistry } from "./registry";
import type { LeftNavDefinition } from "./types";

/**
 * Chrome left-nav only (New Chat, Templates, Teams, Settings).
 *
 * RightArea modules are not listed here. `leftNavRegistry` projects them from
 * `modeRegistry.getLeftNavModes()` — register a workspace mode (and keep it
 * on the「+」menu) to get a customizable Nav slot automatically.
 *
 * Hub items (Templates / Teams) sit under New Chat, above the module Nav, and stay out of Customize.
 */

const newAgentNav: LeftNavDefinition = {
  id: "new-agent",
  section: "primary",
  label: "New Agent",
  labelKey: "nav.newAgent",
  icon: Bot,
  order: 0,
  required: true,
  /** Action only — not a persistent nav destination; never show selected state. */
  isActive: () => false,
  activate: () => {
    useChatStore.getState().newSession();
    const st = useLayoutStore.getState();
    st.setLeftSidebarView("sessions");
    st.clearPendingRightAreaRestore();
  },
  trailing: <ShortcutKbdChips id="product.newChat" />,
};

const templatesNav: LeftNavDefinition = {
  id: "templates",
  section: "hub",
  label: "Templates",
  labelKey: "nav.templates",
  icon: LayoutTemplate,
  order: 0,
  centerView: "templates",
  immersive: true,
  toggleable: true,
  isActive: () => useLayoutStore.getState().leftSidebarView === "templates",
  activate: () => {
    useLayoutStore.getState().setLeftSidebarView("templates");
  },
  onToggleOff: () => {
    useLayoutStore.getState().setLeftSidebarView("sessions");
  },
};

const teamsNav: LeftNavDefinition = {
  id: "teams",
  section: "hub",
  label: "Teams",
  labelKey: "nav.teams",
  icon: Package,
  order: 10,
  centerView: "teams",
  immersive: true,
  toggleable: true,
  isActive: () => useLayoutStore.getState().leftSidebarView === "teams",
  activate: () => {
    useLayoutStore.getState().setLeftSidebarView("teams");
  },
  onToggleOff: () => {
    useLayoutStore.getState().setLeftSidebarView("sessions");
  },
};

const settingsNav: LeftNavDefinition = {
  id: "settings",
  section: "footer",
  label: "Settings",
  labelKey: "nav.settings",
  icon: SettingsIcon,
  order: 0,
  centerView: "settings",
  immersive: true,
  toggleable: true,
  isActive: () => useLayoutStore.getState().leftSidebarView === "settings",
  activate: () => {
    useLayoutStore.getState().setLeftSidebarView("settings");
  },
  onToggleOff: () => {
    const st = useLayoutStore.getState();
    resetSettingsEditors();
    st.setLeftSidebarView("sessions");
  },
  shortcutId: "shell.openSettings",
};

/** 应用启动时注册 chrome 入口（在 App.tsx 于 registerAllModes 之后调用） */
export function registerLeftNavItems(): void {
  leftNavRegistry.register(newAgentNav);
  leftNavRegistry.register(templatesNav);
  leftNavRegistry.register(teamsNav);
  leftNavRegistry.register(settingsNav);
}
