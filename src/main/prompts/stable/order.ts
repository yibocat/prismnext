/** Global modules inside stableSystem — explicit join order (1.2 → 1.3 → 1.4). */
export const GLOBAL_MODULE_ORDER = [
  "research-reasoning",
  "reply-depth",
  "workspace-folders",
] as const;

export type GlobalModuleKey = (typeof GLOBAL_MODULE_ORDER)[number];
