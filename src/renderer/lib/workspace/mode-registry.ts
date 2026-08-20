import type { ComponentType, ReactNode } from "react";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";

// ── Tab Types ──

export type RightTabKind =
  | "file"
  | "research-plan"
  | "browser"
  | "git-overview"
  | "git-diff"
  | "texworkspace"
  | "terminal"
  | "settings-editor"
  | "literature"
  | "experiments"
  | "interaction";

/** Tabs that host an editable project file buffer (Files / TeX / Plan). */
export function isEditableFileTabKind(kind: RightTabKind): boolean {
  return kind === "file" || kind === "texworkspace" || kind === "research-plan";
}

export function isJobMonitorTab(tab: Pick<RightTab, "kind" | "terminalSource">): boolean {
  return tab.kind === "terminal" && (tab.terminalSource === "job-monitor" || tab.terminalSource === "ai");
}

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
  /** Incremented to force the in-tab webview to reload (same URL included). */
  reloadToken?: number;
  hibernated?: boolean;
  viewMode?: string;
  /** User shell vs read-only Job Monitor. Legacy `"ai"` is treated as job-monitor. */
  terminalSource?: "user" | "job-monitor" | "ai";
  /** Optional cwd override for the terminal PTY. When set, TerminalView
   *  spawns at this path instead of resolveTerminalRoot(...) - used by
   *  Sprint 0.7 "Open terminal in lab" to land in an experiment island.
   *  Plain user/AI terminals leave it undefined. */
  terminalCwd?: string;
  /** Execution this Job Monitor tab is attached to */
  linkedExecutionId?: string;
  /** Chat tab that owns this AI terminal */
  linkedChatTabId?: string;
  /** Latest bash tool call mirrored in this tab */
  linkedToolCallId?: string;
  /** Settings RightArea editor payload (forms, markdown, MCP, skills, …) */
  settingsSlot?: SettingsPanelSlot;
  /** Serialized slot identity for tab dedupe */
  settingsSlotKey?: string;
  /** Literature mode: opened paper id */
  literaturePaperId?: string;
  /** Literature mode: grid | reader | notes */
  literatureView?: "grid" | "reader" | "notes";
  /** Experiments mode: selected experiment slug */
  experimentId?: string;
  /** Experiments mode: list | detail (P0 = list always, detail inlined) */
  experimentsView?: "list" | "detail";
  /** Experiments mode: active detail tab pane (overview | run | results) */
  experimentsDetailTab?: "overview" | "run" | "results";
  /** Interaction mode: persisted object id under .prismnext/interactions/<id>/ */
  interactionId?: string;
}

// ── Mode Definition ──

export interface ModeDefinition {
  /** 唯一标识，用作工具栏按钮 key 和 RightArea tab 派生的 mode id */
  id: string;
  /** 工具栏显示标签（英文回退；UI 优先用 labelKey） */
  label: string;
  /** i18n key for toolbar label, e.g. modes.git.label */
  labelKey?: string;
  /** 工具栏图标 (JSX element) */
  icon: ReactNode;
  /** 该模式拥有的 tab 类型。第一个 = 点击模式按钮时默认创建的 tab 类型 */
  tabKinds: RightTabKind[];
  /** 在 workspace / settings 哪些上下文中可用 */
  surface?: ModeSurface;
  /**
   * Whether the mode appears in the RightArea「+」add menu.
   * Default true. Set false for settings-editor / interaction / research-plan.
   */
  showInAddMenu?: boolean;
  /** home / initial tab 默认标题（英文回退；UI 优先用 initialTitleKey） */
  initialTitle: string;
  /** i18n key for initial / home tab title */
  initialTitleKey?: string;
  /** 侧边栏组件；省略则不显示 RightArea 模式侧栏 */
  Sidebar?: ComponentType;
  /** 为 true 时隐藏 RightArea 右侧模式侧栏（如文献库内联详情） */
  hideRightSidebar?: boolean;
  /** 工具栏组件。接收 tab 作为 prop，可内部通过 hook 读取额外 store 数据。省略时隐藏工具栏。 */
  Toolbar?: ComponentType<{ tab: RightTab }>;
  /** 内容区组件。接收 tab + isActive */
  Content: ComponentType<{ tab: RightTab; isActive: boolean }>;
  /** 模式激活时调用（初始化 store / IPC 等）— 仅 0→1 tabs */
  onActivate?: () => void;
  /** 模式去激活时调用 — 仅 1→0 tabs */
  onDeactivate?: () => void;
  /**
   * 「+」菜单策略：
   * - singleton（默认）：该模式已有任意 tab 时从菜单隐藏
   * - multi：始终列出；点选新建一个 tab（Terminal / Browser / Literature）
   */
  addMenuPolicy?: "singleton" | "multi";
  /**
   * Optional override for「+」/ shortcut open.
   * Default: openMode — focus existing tab or ensure home / spawn multi.
   */
  openFromAddMenu?: () => void;
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

  /** Modes shown in the RightArea「+」add menu for a given surface context. */
  getAddMenuModes(surface: "workspace" | "settings"): ModeDefinition[] {
    return Array.from(registry.values()).filter((def) => {
      if (def.showInAddMenu === false) return false;
      const modeSurface = def.surface ?? "workspace";
      if (modeSurface === "any") return true;
      return modeSurface === surface;
    });
  },

  /** Add-menu entries after applying singleton hide-when-open rules. */
  getVisibleAddMenuModes(
    surface: "workspace" | "settings",
    openTabKinds: ReadonlySet<string> | readonly string[],
  ): ModeDefinition[] {
    const open = openTabKinds instanceof Set
      ? openTabKinds
      : new Set(openTabKinds);
    return modeRegistry.getAddMenuModes(surface).filter((def) => {
      const policy = def.addMenuPolicy ?? "singleton";
      if (policy === "multi") return true;
      return !def.tabKinds.some((k) => open.has(k));
    });
  },
};
