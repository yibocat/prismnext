import type { RefObject, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { PanelImperativeHandle } from "react-resizable-panels";

export type LeftNavSection = "primary" | "footer";

export type LeftNavPanelRefs = {
  centerRef?: RefObject<PanelImperativeHandle | null>;
  rightAreaRef?: RefObject<PanelImperativeHandle | null>;
};

export type LeftNavContext = {
  panelRefs: LeftNavPanelRefs;
};

/**
 * 左侧栏导航注册表 — 类型定义
 *
 * 新增入口时实现 LeftNavDefinition，在 items.tsx（或功能模块）里 register 即可。
 * 侧边栏按钮由 leftNavRegistry 自动渲染，勿在 LeftSidebar 里硬编码按钮。
 */
export interface LeftNavDefinition {
  /** 全局唯一 id，pressLeftNav(id) 使用 */
  id: string;
  /** primary = 顶部固定区；footer = 底部（如 Settings） */
  section: LeftNavSection;
  /** Fallback English label (also used when labelKey is absent). */
  label: string;
  /** i18n key — preferred over `label` when set. */
  labelKey?: string;
  icon: LucideIcon;
  /** 同 section 内升序排列 */
  order: number;
  /** 当前项是否处于激活态（控制高亮） */
  isActive: () => boolean;
  /** 从其他项切换过来时调用 */
  activate: (ctx: LeftNavContext) => void;
  /**
   * 其他项被选中时，若本项仍 active，先调用 deactivate 做清理。
   * 右侧全屏类入口（如 TeX Workspace）应在此关闭面板/标签。
   */
  deactivate?: (ctx: LeftNavContext) => void;
  /**
   * true：再次点击时优先走 onToggleOff；若未提供则误落到 LEFT_NAV_DEFAULT_ID
   *（new-agent，会新建 Chat）。沉浸式中心页（Settings / Templates）
   * 必须自备 onToggleOff → sessions。
   */
  toggleable?: boolean;
  onToggleOff?: (ctx: LeftNavContext) => void;
  /**
   * 中间主区域入口：激活时写入 layout-store.leftSidebarView。
   * 还需在 LeftMainArea 增加对应的 centerView 分支渲染页面。
   */
  centerView?: string;
  /**
   * true：进入时收起右侧区域（全屏中间页）。
   * App.tsx 通过 isImmersiveCenterView() 识别，无需再改 App。
   */
  immersive?: boolean;
  /** 行尾附加 UI（如快捷键 Kbd） */
  trailing?: ReactNode;
}
