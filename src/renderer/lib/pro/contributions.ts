/**
 * Central Pro contribution registry (renderer).
 * Private Pro calls ProHostAPI → entries land here → Free UI reads them.
 *
 * Minimal on purpose: only settings until more surfaces are deliberately added.
 */

import type {
  ProContributionsSnapshot,
  ProSettingsContribution,
} from "./contribution-types";

const settings = new Map<string, ProSettingsContribution>();
const declaredFeatures = new Set<string>();

function putUnique<T extends { id: string }>(
  map: Map<string, T>,
  item: T,
  kind: string,
): boolean {
  if (map.has(item.id)) {
    console.warn(`[pro] ${kind} "${item.id}" already registered — skipped`);
    return false;
  }
  map.set(item.id, item);
  return true;
}

export const proContributions = {
  clear(): void {
    settings.clear();
    declaredFeatures.clear();
  },

  addDeclaredFeatures(ids: ReadonlyArray<string>): void {
    for (const id of ids) declaredFeatures.add(id);
  },

  getDeclaredFeatures(): string[] {
    return [...declaredFeatures];
  },

  addSettings(contrib: ProSettingsContribution): boolean {
    return putUnique(settings, contrib, "settings");
  },

  getSettings(): ProSettingsContribution[] {
    return [...settings.values()].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
  },

  snapshot(): ProContributionsSnapshot {
    return {
      settings: this.getSettings(),
      declaredFeatures: this.getDeclaredFeatures(),
    };
  },
};
