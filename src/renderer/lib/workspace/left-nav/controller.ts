import { LEFT_NAV_DEFAULT_ID, leftNavRegistry } from "./registry";

function deactivateOthers(activeId: string): void {
  for (const def of leftNavRegistry.getAll()) {
    if (def.id === activeId || !def.isActive()) continue;
    def.deactivate?.();
  }
}

/**
 * 左侧栏按钮点击的统一入口（互斥 + toggle）。
 *
 * 一般不需要直接调用：LeftNavButton 已接入。
 * 快捷键 / 命令面板等程序化跳转时，可 pressLeftNav(id)。
 */
export function pressLeftNav(id: string): void {
  const def = leftNavRegistry.get(id);
  if (!def) return;

  if (def.toggleable && def.isActive()) {
    if (def.onToggleOff) {
      def.onToggleOff();
      return;
    }
    pressLeftNav(LEFT_NAV_DEFAULT_ID);
    return;
  }

  deactivateOthers(id);
  def.activate();
}
