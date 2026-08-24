import { leftNavRegistry } from "./registry";
import type { LeftNavDefinition } from "./types";

export type LeftNavLayoutPrefs = {
  hiddenIds: string[];
  order: string[];
};

/** Shown in the module Nav until the user customizes. Everything else starts hidden. */
export const DEFAULT_VISIBLE_LEFT_NAV_IDS = ["texworkspace", "literature"] as const;

/** Older customize prefs used a hand-written TeX nav id. */
const LEFT_NAV_ID_ALIASES: Record<string, string> = {
  "tex-workspace": "texworkspace",
};

export function isDefaultVisibleLeftNav(id: string): boolean {
  return (DEFAULT_VISIBLE_LEFT_NAV_IDS as readonly string[]).includes(id);
}

export function defaultHiddenLeftNavIds(
  primary: Array<Pick<LeftNavDefinition, "id" | "required">>,
): string[] {
  return primary
    .filter((item) => !isLeftNavRequired(item) && !isDefaultVisibleLeftNav(item.id))
    .map((item) => item.id);
}

function canonicalLeftNavId(id: string): string {
  return LEFT_NAV_ID_ALIASES[id] ?? id;
}

export function isLeftNavRequired(item: Pick<LeftNavDefinition, "id" | "required">): boolean {
  return item.required === true;
}

export function requiredPrimaryNavIds(items: Array<Pick<LeftNavDefinition, "id" | "required">>): string[] {
  return items.filter(isLeftNavRequired).map((item) => item.id);
}

function uniqueKnown(ids: readonly string[] | undefined, known: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids ?? []) {
    const id = canonicalLeftNavId(raw);
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function defaultOrderIds(
  primary: Array<Pick<LeftNavDefinition, "id" | "order" | "required">>,
): string[] {
  const required = requiredPrimaryNavIds(primary);
  const visible = DEFAULT_VISIBLE_LEFT_NAV_IDS.filter((id) =>
    primary.some((item) => item.id === id),
  );
  const rest = [...primary]
    .sort((a, b) => a.order - b.order)
    .map((item) => item.id)
    .filter((id) => !required.includes(id) && !isDefaultVisibleLeftNav(id));
  return [...required, ...visible, ...rest];
}

export function sanitizeLeftNavPrefs(
  prefs: Partial<LeftNavLayoutPrefs> | undefined,
  primary: Array<Pick<LeftNavDefinition, "id" | "order" | "required">>,
): LeftNavLayoutPrefs {
  const known = new Set(primary.map((item) => item.id));
  const required = new Set(requiredPrimaryNavIds(primary));
  const acknowledged = new Set([
    ...uniqueKnown(prefs?.hiddenIds, known),
    ...uniqueKnown(prefs?.order, known),
  ]);
  const hidden = new Set(
    prefs?.hiddenIds == null
      ? defaultHiddenLeftNavIds(primary)
      : uniqueKnown(prefs.hiddenIds, known).filter((id) => !required.has(id)),
  );
  for (const item of primary) {
    if (isLeftNavRequired(item) || acknowledged.has(item.id)) continue;
    if (!isDefaultVisibleLeftNav(item.id)) hidden.add(item.id);
  }
  const byOrder = defaultOrderIds(primary);
  const preferred = uniqueKnown(prefs?.order, known);
  const order = [...preferred, ...byOrder.filter((id) => !preferred.includes(id))];
  return { hiddenIds: [...hidden], order };
}

export function resolvePrimaryNavItems<T extends Pick<LeftNavDefinition, "id" | "order" | "required">>(
  items: T[],
  prefs: Partial<LeftNavLayoutPrefs> | undefined,
): T[] {
  const { hiddenIds, order } = sanitizeLeftNavPrefs(prefs, items);
  const hidden = new Set(hiddenIds);
  const rank = new Map(order.map((id, index) => [id, index]));
  return items
    .filter((item) => isLeftNavRequired(item) || !hidden.has(item.id))
    .sort((a, b) => {
      const req = Number(isLeftNavRequired(b)) - Number(isLeftNavRequired(a));
      if (req !== 0) return req;
      return (rank.get(a.id) ?? a.order) - (rank.get(b.id) ?? b.order);
    });
}

export function optionalPrimaryNavItems<T extends Pick<LeftNavDefinition, "id" | "order" | "required">>(
  items: T[],
  prefs: Partial<LeftNavLayoutPrefs> | undefined,
): T[] {
  const { order } = sanitizeLeftNavPrefs(prefs, items);
  const rank = new Map(order.map((id, index) => [id, index]));
  return items
    .filter((item) => !isLeftNavRequired(item))
    .sort((a, b) => (rank.get(a.id) ?? a.order) - (rank.get(b.id) ?? b.order));
}

export function toggleLeftNavHidden(
  hiddenIds: readonly string[],
  id: string,
  requiredIds: readonly string[],
): string[] {
  if (requiredIds.includes(id)) return [...hiddenIds];
  const hidden = new Set(hiddenIds);
  if (hidden.has(id)) hidden.delete(id);
  else hidden.add(id);
  return [...hidden];
}

export function moveLeftNavOrder(order: readonly string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) {
    return [...order];
  }
  const next = [...order];
  const [item] = next.splice(from, 1);
  if (item == null) return [...order];
  next.splice(to, 0, item);
  return next;
}

/** Close a module that was just hidden while it is still the active view. */
export function deactivateHiddenLeftNav(hiddenIds: readonly string[]): void {
  for (const id of hiddenIds) {
    const def = leftNavRegistry.get(id);
    if (!def || isLeftNavRequired(def) || !def.isActive()) continue;
    if (def.onToggleOff) def.onToggleOff();
    else def.deactivate?.();
  }
}
