import { workspaceModeNavItems } from "./mode-nav";
import type { LeftNavDefinition, LeftNavSection } from "./types";

export const LEFT_NAV_DEFAULT_ID = "new-agent";

const registry = new Map<string, LeftNavDefinition>();

function chromeItems(): LeftNavDefinition[] {
  return Array.from(registry.values());
}

function mergedItems(): LeftNavDefinition[] {
  return [...chromeItems(), ...workspaceModeNavItems()].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

/**
 * 左侧栏导航注册表。
 *
 * Chrome（New Chat / Templates / Teams / Settings）用 register。
 * RightArea 模块由 modeRegistry 投影，无需在 items.tsx 再写一份。
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
    return registry.get(id) ?? workspaceModeNavItems().find((d) => d.id === id);
  },

  getAll(): LeftNavDefinition[] {
    return mergedItems();
  },

  getBySection(section: LeftNavSection): LeftNavDefinition[] {
    return mergedItems().filter((d) => d.section === section);
  },

  getByCenterView(view: string): LeftNavDefinition | undefined {
    for (const def of registry.values()) {
      if (def.centerView === view) return def;
    }
    return undefined;
  },

  isImmersiveCenterView(view: string): boolean {
    return chromeItems().some((d) => d.centerView === view && d.immersive);
  },
};
