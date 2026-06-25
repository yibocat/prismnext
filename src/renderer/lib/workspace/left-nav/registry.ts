import type { LeftNavDefinition, LeftNavSection } from "./types";

export const LEFT_NAV_DEFAULT_ID = "new-agent";

const registry = new Map<string, LeftNavDefinition>();

/**
 * 左侧栏导航注册表。
 *
 * 使用 leftNavRegistry.register(def) 注册新入口；
 * LeftSidebar 通过 getBySection("primary" | "footer") 自动渲染，无需改 UI 组件。
 */
export const leftNavRegistry = {
  /** 注册一项导航；id 重复会抛错 */
  register(def: LeftNavDefinition): void {
    if (registry.has(def.id)) {
      throw new Error(
        `Left nav "${def.id}" is already registered. Each entry must have a unique id.`,
      );
    }
    registry.set(def.id, def);
  },

  get(id: string): LeftNavDefinition | undefined {
    return registry.get(id);
  },

  getAll(): LeftNavDefinition[] {
    return Array.from(registry.values()).sort((a, b) => a.order - b.order);
  },

  getBySection(section: LeftNavSection): LeftNavDefinition[] {
    return this.getAll().filter((d) => d.section === section);
  },

  getByCenterView(view: string): LeftNavDefinition | undefined {
    for (const def of registry.values()) {
      if (def.centerView === view) return def;
    }
    return undefined;
  },

  isImmersiveCenterView(view: string): boolean {
    return this.getAll().some((d) => d.centerView === view && d.immersive);
  },
};
