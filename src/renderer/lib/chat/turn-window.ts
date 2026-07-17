/** Temporary test values — restore HARD=5 / SOFT=10 / PAGE=5 after UX check. */
export const TURN_WINDOW_HARD = 5;
export const TURN_WINDOW_SOFT = 10;
export const TURN_WINDOW_PAGE = 5;
export const TURN_WINDOW_ESTIMATED_HEIGHT_PX = 320;
export const TURN_WINDOW_SENTINEL_SUPPRESS_MS = 400;
/** Second upward gesture must accumulate this many px at the top before loading. */
export const TURN_WINDOW_LOAD_PULL_PX = 160;
/**
 * After the last coasting (1st-gesture) upward wheel, wait this long with no further
 * upward wheels before treating inertia as finished. Not a UX pause — gesture-end detect.
 */
export const TURN_WINDOW_COAST_END_MS = 48;

export function initialWindowStart(totalTurns: number): number {
  if (totalTurns <= TURN_WINDOW_SOFT) return 0;
  return Math.max(0, totalTurns - TURN_WINDOW_HARD);
}

export function maybeSnapWindowStart(input: {
  totalTurns: number;
  windowStart: number;
  followingBottom: boolean;
  isStreaming: boolean;
}): number {
  const { totalTurns, windowStart, followingBottom, isStreaming } = input;
  if (isStreaming || !followingBottom) return windowStart;
  if (totalTurns <= 0) return 0;
  const mounted = totalTurns - windowStart;
  if (mounted <= TURN_WINDOW_SOFT) return windowStart;
  return Math.max(0, totalTurns - TURN_WINDOW_HARD);
}

export function pageUpWindowStart(windowStart: number): number {
  return Math.max(0, windowStart - TURN_WINDOW_PAGE);
}

export function spacerHeightPx(
  windowStart: number,
  heights: ReadonlyMap<number, number> | ReadonlyArray<number | undefined>,
  estimatedPx: number = TURN_WINDOW_ESTIMATED_HEIGHT_PX,
): number {
  if (windowStart <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < windowStart; i++) {
    let h: number | undefined;
    if (heights instanceof Map) {
      h = heights.get(i);
    } else if (Array.isArray(heights)) {
      h = heights[i];
    }
    sum += typeof h === "number" && h > 0 ? h : estimatedPx;
  }
  return sum;
}

export interface TurnWindowTabState {
  windowStart: number;
  heights: Map<number, number>;
  /** Last totalTurns seen by resolveWindowStart — detects short→long hydrate jumps. */
  lastTotalTurns: number;
}

const byTab = new Map<string, TurnWindowTabState>();
const initializedTabs = new Set<string>();

export function resolveWindowStart(tabId: string, totalTurns: number): number {
  const s = ensure(tabId);
  const prevTotal = s.lastTotalTurns;

  if (totalTurns <= TURN_WINDOW_SOFT) {
    setTurnWindowStart(tabId, 0);
    initializedTabs.add(tabId);
    s.lastTotalTurns = totalTurns;
    return 0;
  }

  // Empty/short session → long history hydrate (loadSession / disk resync).
  // Do not keep windowStart=0 or we would mount the entire transcript.
  if (
    initializedTabs.has(tabId) &&
    prevTotal <= TURN_WINDOW_SOFT &&
    totalTurns > TURN_WINDOW_SOFT
  ) {
    const start = initialWindowStart(totalTurns);
    setTurnWindowStart(tabId, start);
    s.lastTotalTurns = totalTurns;
    return start;
  }

  if (!initializedTabs.has(tabId)) {
    initializedTabs.add(tabId);
    const start = initialWindowStart(totalTurns);
    setTurnWindowStart(tabId, start);
    s.lastTotalTurns = totalTurns;
    return start;
  }

  const stored = s.windowStart;
  if (stored >= totalTurns) {
    const start = initialWindowStart(totalTurns);
    setTurnWindowStart(tabId, start);
    s.lastTotalTurns = totalTurns;
    return start;
  }

  s.lastTotalTurns = totalTurns;
  return stored;
}

function ensure(tabId: string): TurnWindowTabState {
  let s = byTab.get(tabId);
  if (!s) {
    s = { windowStart: 0, heights: new Map(), lastTotalTurns: 0 };
    byTab.set(tabId, s);
  }
  return s;
}

export function getTurnWindowState(tabId: string): TurnWindowTabState {
  const s = ensure(tabId);
  return {
    windowStart: s.windowStart,
    heights: new Map(s.heights),
    lastTotalTurns: s.lastTotalTurns,
  };
}

export function setTurnWindowStart(tabId: string, start: number): void {
  ensure(tabId).windowStart = Math.max(0, start);
}

export function setTurnHeight(tabId: string, turnIndex: number, height: number): void {
  if (height <= 0) return;
  ensure(tabId).heights.set(turnIndex, height);
}

export function resetTurnWindowState(tabId: string, totalTurns: number): void {
  const s = ensure(tabId);
  s.windowStart = initialWindowStart(totalTurns);
  s.lastTotalTurns = totalTurns;
  initializedTabs.add(tabId);
  // keep heights — useful for spacer after restore
}

export function clearTurnWindowState(tabId: string): void {
  byTab.delete(tabId);
  initializedTabs.delete(tabId);
}

/** Test-only: wipe all tabs */
export function _clearAllTurnWindowStateForTests(): void {
  byTab.clear();
  initializedTabs.clear();
}
