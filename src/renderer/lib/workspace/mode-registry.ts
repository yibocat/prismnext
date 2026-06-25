import type { ComponentType, ReactNode } from "react";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";

// ── Tab Types ──

export type RightTabKind =
  | "file"
  | "browser"
  | "git-overview"
  | "git-diff"
  | "texworkspace"
  | "terminal"
  | "settings-editor";

/** Where a mode may appear in the app chrome. */
export type ModeSurface = "workspace" | "settings" | "any";

export interface RightTab {
  id: string;
  kind: RightTabKind;
  title: string;
  isInitial: boolean;
  /** Preview tab (italic) — replaced on next single-click open until pinned */
  isPreview?: boolean;
  /** File lives outside the project root */
  isExternal?: boolean;
  filePath?: string;
  fileId?: string;
  url?: string;
  isLoading?: boolean;
  hibernated?: boolean;
  viewMode?: string;
  /** User shell vs AI agent mirror terminal */
  terminalSource?: "user" | "ai";
  /** Chat tab that owns this AI terminal */
  linkedChatTabId?: string;
  /** Latest bash tool call mirrored in this tab */
  linkedToolCallId?: string;
  /** Settings RightArea editor payload (forms, markdown, MCP, skills, …) */
  settingsSlot?: SettingsPanelSlot;
  /** Serialized slot identity for tab dedupe */
  settingsSlotKey?: string;
}

// ── Mode Definition ──

export interface ModeDefinition {
  /** 唯一标识，用作工具栏按钮 key 和 layout-store activeModes 的元素 */
  id: string;
  /** 工具栏显示标签 */
  label: string;
  /** 工具栏图标 (JSX element) */
  icon: ReactNode;
  /** 该模式拥有的 tab 类型。第一个 = 点击模式按钮时默认创建的 tab 类型 */
  tabKinds: RightTabKind[];
  /** 在 workspace / settings 哪些上下文中可用 */
  surface?: ModeSurface;
  /** 是否出现在 RightArea 模式工具栏（Files / Browser / …） */
  showInModeToolbar?: boolean;
  /** persistent: 最后 tab 关闭时重生 home tab；transient: 去激活模式 */
  persistence: "persistent" | "transient";
  /** home / initial tab 默认标题 */
  initialTitle: string;
  /** 侧边栏组件 */
  Sidebar: ComponentType;
  /** 工具栏组件。接收 tab 作为 prop，可内部通过 hook 读取额外 store 数据。省略时隐藏工具栏。 */
  Toolbar?: ComponentType<{ tab: RightTab }>;
  /** 内容区组件。接收 tab + isActive */
  Content: ComponentType<{ tab: RightTab; isActive: boolean }>;
  /** 模式激活时调用（初始化 store / IPC 等） */
  onActivate?: () => void;
  /** 模式去激活时调用 */
  onDeactivate?: () => void;
}

// ── Registry ──

const registry = new Map<string, ModeDefinition>();

export const modeRegistry = {
  register(def: ModeDefinition): void {
    if (registry.has(def.id)) {
      throw new Error(
        `Mode "${def.id}" is already registered. Each mode must have a unique id.`,
      );
    }
    registry.set(def.id, def);
  },

  get(id: string): ModeDefinition | undefined {
    return registry.get(id);
  },

  getAll(): ModeDefinition[] {
    return Array.from(registry.values());
  },

  /** 根据 tab kind 反查所属模式（替代 kindToMode） */
  findByTabKind(kind: RightTabKind): ModeDefinition | undefined {
    for (const def of registry.values()) {
      if (def.tabKinds.includes(kind)) return def;
    }
    return undefined;
  },

  /** 获取某模式的默认 tab 类型（tabKinds 的第一个） */
  defaultTabKind(modeId: string): RightTabKind | undefined {
    return registry.get(modeId)?.tabKinds[0];
  },

  /** Modes shown in the RightArea toolbar for a given surface context. */
  getToolbarModes(surface: "workspace" | "settings"): ModeDefinition[] {
    return Array.from(registry.values()).filter((def) => {
      if (def.showInModeToolbar === false) return false;
      const modeSurface = def.surface ?? "workspace";
      if (modeSurface === "any") return true;
      return modeSurface === surface;
    });
  },
};
