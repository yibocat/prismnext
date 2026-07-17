import { Bot, BookOpenIcon, FileType, FlaskConical, LayoutTemplate, SettingsIcon } from "lucide-react";
import { ShortcutKbdChips } from "@/lib/shortcuts";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { resetSettingsEditors } from "@/stores/settings-panel-store";
import { leftNavRegistry } from "./registry";
import {
  closeExperimentsPanel,
  closeLiteraturePanel,
  closeTexWorkspace,
  isExperimentsPanelOpen,
  isLiteraturePanelOpen,
  isTexWorkspaceOpen,
  openExperimentsPanel,
  openLiteratureLibrary,
  openTexWorkspaceMaximized,
} from "./panel-utils";
import type { LeftNavContext, LeftNavDefinition } from "./types";

/**
 * 内置左侧栏导航项 + 注册入口
 *
 * ── 新增一个入口（Checklist）──
 * 1. 在本文件（或功能模块的 register-*.ts）定义 LeftNavDefinition
 * 2. 在 registerLeftNavItems() 末尾调用 leftNavRegistry.register(yourNav)
 * 3. 若 centerView 型（中间全屏页）：
 *    - activate 里 setLeftSidebarView(centerView)
 *    - immersive: true 时右侧区域会自动收起
 *    - 在 LeftMainArea 增加 if (leftSidebarView === centerView) 渲染对应页面
 * 4. 若右侧全屏型（类似 TeX Workspace）：
 *    - isActive / activate / deactivate 操作右侧面板（见 texWorkspaceNav）
 *    - 通常不需要 centerView
 *
 * ── 示例：中间沉浸式页面 ──
 *
 *   const zoteroNav: LeftNavDefinition = {
 *     id: "zotero",
 *     section: "primary",
 *     label: "Zotero",
 *     icon: BookOpen,
 *     order: 30,
 *     centerView: "zotero",
 *     immersive: true,
 *     toggleable: true,
 *     isActive: () => useLayoutStore.getState().leftSidebarView === "zotero",
 *     activate: (ctx) => {
 *       closeTexWorkspace(ctx); // 若需退出 TeX，复用 panel-utils
 *       useLayoutStore.getState().setLeftSidebarView("zotero");
 *     },
 *   };
 */

const newAgentNav: LeftNavDefinition = {
  id: "new-agent",
  section: "primary",
  label: "New Agent",
  labelKey: "nav.newAgent",
  icon: Bot,
  order: 0,
  /** Action only — not a persistent nav destination; never show selected state. */
  isActive: () => false,
  activate: (ctx) => {
    useChatStore.getState().newSession();
    const st = useLayoutStore.getState();
    st.setLeftSidebarView("sessions");
    st.clearPendingRightAreaRestore();
    closeTexWorkspace(ctx);
  },
  trailing: <ShortcutKbdChips id="product.newChat" />,
};

const literatureNav: LeftNavDefinition = {
  id: "literature",
  section: "primary",
  label: "Library",
  labelKey: "nav.library",
  icon: BookOpenIcon,
  order: 10,
  toggleable: true,
  isActive: () => isLiteraturePanelOpen(),
  activate: (ctx) => {
    openLiteratureLibrary(ctx);
  },
  deactivate: (ctx) => {
    closeLiteraturePanel(ctx);
  },
  onToggleOff: (ctx) => {
    closeLiteraturePanel(ctx);
    useLayoutStore.getState().setLeftSidebarView("sessions");
  },
};

const experimentsNav: LeftNavDefinition = {
  id: "experiments",
  section: "primary",
  label: "Experiments",
  labelKey: "nav.experiments",
  icon: FlaskConical,
  order: 15,
  toggleable: true,
  isActive: () => isExperimentsPanelOpen(),
  activate: (ctx) => {
    openExperimentsPanel(ctx);
  },
  deactivate: (ctx) => {
    closeExperimentsPanel(ctx);
  },
  onToggleOff: (ctx) => {
    closeExperimentsPanel(ctx);
    useLayoutStore.getState().setLeftSidebarView("sessions");
  },
};

const templatesNav: LeftNavDefinition = {
  id: "templates",
  section: "primary",
  label: "Templates",
  labelKey: "nav.templates",
  icon: LayoutTemplate,
  order: 20,
  centerView: "templates",
  immersive: true,
  toggleable: true,
  isActive: () => useLayoutStore.getState().leftSidebarView === "templates",
  activate: (ctx) => {
    closeTexWorkspace(ctx);
    closeLiteraturePanel(ctx);
    useLayoutStore.getState().setLeftSidebarView("templates");
  },
};

const texWorkspaceNav: LeftNavDefinition = {
  id: "tex-workspace",
  section: "primary",
  label: "TeX Workspace",
  labelKey: "nav.texWorkspace",
  icon: FileType,
  order: 5,
  toggleable: true,
  isActive: () => isTexWorkspaceOpen(),
  activate: (ctx) => {
    openTexWorkspaceMaximized(ctx);
  },
  deactivate: (ctx) => {
    closeTexWorkspace(ctx);
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
  activate: (ctx) => {
    closeTexWorkspace(ctx);
    closeLiteraturePanel(ctx);
    useLayoutStore.getState().setLeftSidebarView("settings");
  },
  onToggleOff: () => {
    const st = useLayoutStore.getState();
    const doc = useDocumentStore.getState();
    resetSettingsEditors();
    if (!doc.projectRoot) {
      doc.setShowWelcome(true);
    }
    st.setLeftSidebarView("sessions");
  },
};

/** 应用启动时注册所有左侧栏入口（在 App.tsx 与 registerAllModes 一并调用） */
export function registerLeftNavItems(): void {
  leftNavRegistry.register(newAgentNav);
  leftNavRegistry.register(texWorkspaceNav);
  leftNavRegistry.register(literatureNav);
  leftNavRegistry.register(experimentsNav);
  leftNavRegistry.register(templatesNav);
  leftNavRegistry.register(settingsNav);
  // leftNavRegistry.register(yourNav);  // ← 新入口加在这里，或拆到 feature 模块再 import
}
