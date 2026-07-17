/**
 * Pure helpers for horizontal tab reorder (RightArea + Chat open tabs).
 * insertIndex is a slot in the original list: 0 … n (n = append after last).
 */

export type TabStripRect = { left: number; width: number };

/** Slot before the first tab whose midpoint is to the right of clientX. */
export function computeInsertIndex(
  clientX: number,
  tabRects: readonly TabStripRect[],
): number {
  for (let i = 0; i < tabRects.length; i++) {
    const r = tabRects[i]!;
    const mid = r.left + r.width / 2;
    if (clientX < mid) return i;
  }
  return tabRects.length;
}

/**
 * When the pointer overshoots past the first/last tab (common at strip ends),
 * clamp X into the tab range so insert still resolves to 0…n instead of
 * depending on a hairline hit target past the last edge.
 */
export function clampClientXToTabRange(
  clientX: number,
  tabRects: readonly TabStripRect[],
): number {
  if (tabRects.length === 0) return clientX;
  const first = tabRects[0]!;
  const last = tabRects[tabRects.length - 1]!;
  const min = first.left;
  const max = last.left + last.width;
  if (clientX < min) return min;
  if (clientX > max) return max;
  return clientX;
}

/**
 * Convert insert slot (pre-removal) to destination index for
 * `arr.splice(from,1); arr.splice(to,0,item)`.
 */
export function reorderIndex(from: number, insertIndex: number): number {
  if (insertIndex > from) return insertIndex - 1;
  return insertIndex;
}

/** True when the drop would not change order. */
export function isNoOpReorder(from: number, insertIndex: number): boolean {
  return insertIndex === from || insertIndex === from + 1;
}
