# Chat Turn Sliding Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount only a Soft/Hard sliding window of chat turns so long sessions stay smooth, while keeping full `messages[]` in Zustand (Phase 1).

**Architecture:** Pure turn-window math in `lib/chat/turn-window.ts`; per-tab UI state (windowStart + heights) outside the streaming hot path; `ChatMessages` renders spacer + sentinel + sliced turns and wires existing sentinel scroll helpers. No Virtuoso, no `sessionLoadWindow` yet.

**Tech Stack:** React 19, Zustand chat store (read-only for messages), Vitest, existing `active-turn-scroll` sentinel APIs.

## Global Constraints

- Window unit = visible user turn (same grouping as `chat-messages.tsx` / `countUserTurns`)
- `HARD = 7`, `SOFT = 14`, `PAGE = 7` (single constants module)
- Phase 1: never delete/truncate `tabs[].messages` for windowing
- Snap only at turn boundaries when following bottom — never on stream deltas
- Inactive tabs: DOM already unmounts; do not trim their `messages[]`
- Do not introduce `react-virtuoso` for chat
- Changelog under `## 0.5.13 (Unreleased)` (package.json is `0.5.12`)
- Prefer domain homes: `src/renderer/lib/chat/` + `chat-messages.tsx` — no one-off patch filenames

## File structure

| File | Responsibility |
|------|----------------|
| `src/renderer/lib/chat/turn-window.ts` | Constants + pure window math + spacer height + per-tab state Map |
| `tests/renderer/turn-window.test.ts` | Unit tests for math / snap / page-up / spacer / tab state |
| `src/renderer/lib/chat/index.ts` | Re-export public turn-window symbols used elsewhere |
| `src/renderer/components/modules/chat/chat-messages.tsx` | Slice render, spacer, sentinel, measure heights, wire snap/page-up |
| `changelog/0.5.x.md` | User-facing note under 0.5.13 |

**Critical render detail:** `TurnFooter` today gets `turnIndex={turnIdx}` from the full `turns` array. After slicing, pass **absolute** turn index (`windowStart + localIdx`) so checkpoint restore stays correct.

---

### Task 1: Pure turn-window math + tests

**Files:**
- Create: `src/renderer/lib/chat/turn-window.ts`
- Create: `tests/renderer/turn-window.test.ts`
- Modify: `src/renderer/lib/chat/index.ts`

**Interfaces:**
- Produces:
  - `TURN_WINDOW_HARD: 7`, `TURN_WINDOW_SOFT: 14`, `TURN_WINDOW_PAGE: 7`, `TURN_WINDOW_ESTIMATED_HEIGHT_PX: 320`, `TURN_WINDOW_SENTINEL_SUPPRESS_MS: 400`
  - `initialWindowStart(totalTurns: number): number`
  - `maybeSnapWindowStart(input: { totalTurns: number; windowStart: number; followingBottom: boolean; isStreaming: boolean }): number`
  - `pageUpWindowStart(windowStart: number): number`
  - `spacerHeightPx(windowStart: number, heights: ReadonlyMap<number, number> | ReadonlyArray<number | undefined>, estimatedPx?: number): number`
  - Per-tab helpers: `getTurnWindowState(tabId: string)`, `setTurnWindowStart(tabId: string, start: number)`, `setTurnHeight(tabId: string, turnIndex: number, height: number)`, `resetTurnWindowState(tabId: string)`, `clearTurnWindowState(tabId: string)` (for tests / tab close optional)

- [ ] **Step 1: Write the failing test**

```ts
// tests/renderer/turn-window.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  TURN_WINDOW_HARD,
  TURN_WINDOW_PAGE,
  TURN_WINDOW_SOFT,
  clearTurnWindowState,
  initialWindowStart,
  maybeSnapWindowStart,
  pageUpWindowStart,
  setTurnHeight,
  setTurnWindowStart,
  getTurnWindowState,
  spacerHeightPx,
} from "../../src/renderer/lib/chat/turn-window";

describe("turn-window math", () => {
  it("initialWindowStart mounts all turns when total ≤ SOFT", () => {
    expect(initialWindowStart(0)).toBe(0);
    expect(initialWindowStart(TURN_WINDOW_SOFT)).toBe(0);
  });

  it("initialWindowStart keeps only HARD turns when total > SOFT", () => {
    expect(initialWindowStart(TURN_WINDOW_SOFT + 1)).toBe(
      TURN_WINDOW_SOFT + 1 - TURN_WINDOW_HARD,
    );
    expect(initialWindowStart(100)).toBe(100 - TURN_WINDOW_HARD);
  });

  it("maybeSnapWindowStart snaps only when following, not streaming, and mounted > SOFT", () => {
    const start = 0;
    const total = TURN_WINDOW_SOFT + 1; // mounted = total - start = 15
    expect(
      maybeSnapWindowStart({
        totalTurns: total,
        windowStart: start,
        followingBottom: true,
        isStreaming: false,
      }),
    ).toBe(total - TURN_WINDOW_HARD);

    expect(
      maybeSnapWindowStart({
        totalTurns: total,
        windowStart: start,
        followingBottom: false,
        isStreaming: false,
      }),
    ).toBe(start);

    expect(
      maybeSnapWindowStart({
        totalTurns: total,
        windowStart: start,
        followingBottom: true,
        isStreaming: true,
      }),
    ).toBe(start);
  });

  it("maybeSnapWindowStart is a no-op when mounted ≤ SOFT", () => {
    expect(
      maybeSnapWindowStart({
        totalTurns: TURN_WINDOW_SOFT,
        windowStart: 0,
        followingBottom: true,
        isStreaming: false,
      }),
    ).toBe(0);
  });

  it("pageUpWindowStart steps back by PAGE and clamps to 0", () => {
    expect(pageUpWindowStart(20)).toBe(20 - TURN_WINDOW_PAGE);
    expect(pageUpWindowStart(3)).toBe(0);
    expect(pageUpWindowStart(0)).toBe(0);
  });

  it("spacerHeightPx sums measured heights and estimates missing ones", () => {
    const heights = new Map<number, number>([
      [0, 100],
      [1, 200],
    ]);
    // windowStart=3 → turns 0,1,2; turn 2 missing → estimate
    expect(spacerHeightPx(3, heights, 50)).toBe(100 + 200 + 50);
    expect(spacerHeightPx(0, heights)).toBe(0);
  });
});

describe("turn-window per-tab state", () => {
  beforeEach(() => {
    clearTurnWindowState("tab-a");
    clearTurnWindowState("tab-b");
  });

  it("stores windowStart and heights per tabId", () => {
    setTurnWindowStart("tab-a", 7);
    setTurnHeight("tab-a", 0, 120);
    setTurnHeight("tab-b", 0, 999);
    expect(getTurnWindowState("tab-a")).toEqual({
      windowStart: 7,
      heights: new Map([[0, 120]]),
    });
    expect(getTurnWindowState("tab-b").heights.get(0)).toBe(999);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/renderer/turn-window.test.ts`

Expected: FAIL — module not found / exports missing

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/lib/chat/turn-window.ts
export const TURN_WINDOW_HARD = 7;
export const TURN_WINDOW_SOFT = 14;
export const TURN_WINDOW_PAGE = 7;
export const TURN_WINDOW_ESTIMATED_HEIGHT_PX = 320;
export const TURN_WINDOW_SENTINEL_SUPPRESS_MS = 400;

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
    const h =
      heights instanceof Map ? heights.get(i) : heights[i];
    sum += typeof h === "number" && h > 0 ? h : estimatedPx;
  }
  return sum;
}

export interface TurnWindowTabState {
  windowStart: number;
  heights: Map<number, number>;
}

const byTab = new Map<string, TurnWindowTabState>();

function ensure(tabId: string): TurnWindowTabState {
  let s = byTab.get(tabId);
  if (!s) {
    s = { windowStart: 0, heights: new Map() };
    byTab.set(tabId, s);
  }
  return s;
}

export function getTurnWindowState(tabId: string): TurnWindowTabState {
  const s = ensure(tabId);
  return { windowStart: s.windowStart, heights: new Map(s.heights) };
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
  // keep heights — useful for spacer after restore
}

export function clearTurnWindowState(tabId: string): void {
  byTab.delete(tabId);
}

/** Test-only: wipe all tabs */
export function _clearAllTurnWindowStateForTests(): void {
  byTab.clear();
}
```

Also add to `src/renderer/lib/chat/index.ts`:

```ts
export * from "./turn-window";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/renderer/turn-window.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/chat/turn-window.ts src/renderer/lib/chat/index.ts tests/renderer/turn-window.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): add turn-window math for Soft/Hard sliding mount

Pure helpers and per-tab windowStart/heights state for Phase 1 chat DOM windowing.
EOF
)"
```

---

### Task 2: Slice render + spacer + absolute turnIndex in ChatMessages

**Files:**
- Modify: `src/renderer/components/modules/chat/chat-messages.tsx`
- Test: extend `tests/renderer/turn-window.test.ts` only if new pure helpers are needed; otherwise manual/component behavior covered in Task 3–4

**Interfaces:**
- Consumes: `initialWindowStart`, `getTurnWindowState`, `setTurnWindowStart`, `setTurnHeight`, `spacerHeightPx`, `TURN_WINDOW_*`
- Produces: UI mounts `turns.slice(windowStart)` with top spacer; `TurnFooter turnIndex` is absolute

- [ ] **Step 1: Initialize / sync windowStart when tab or turn count changes**

Put init tracking in `turn-window.ts` (used again in Task 5):

```ts
const initializedTabs = new Set<string>();

export function resolveWindowStart(tabId: string, totalTurns: number): number {
  if (totalTurns <= TURN_WINDOW_SOFT) {
    setTurnWindowStart(tabId, 0);
    initializedTabs.add(tabId);
    return 0;
  }
  if (!initializedTabs.has(tabId)) {
    initializedTabs.add(tabId);
    const start = initialWindowStart(totalTurns);
    setTurnWindowStart(tabId, start);
    return start;
  }
  const stored = getTurnWindowState(tabId).windowStart;
  if (stored >= totalTurns) {
    const start = initialWindowStart(totalTurns);
    setTurnWindowStart(tabId, start);
    return start;
  }
  return stored;
}

// clearTurnWindowState(tabId) must also: initializedTabs.delete(tabId)
```

Inside `ChatMessages`, after `turns` is computed:

```tsx
import {
  getTurnWindowState,
  resolveWindowStart,
  setTurnHeight,
  spacerHeightPx,
} from "@/lib/chat/turn-window";

const [windowStart, setWindowStartState] = useState(0);

useLayoutEffect(() => {
  if (!activeTabId || isLoadingSession) return;
  const start = resolveWindowStart(activeTabId, turns.length);
  setWindowStartState(start);
}, [activeTabId, turns.length, isLoadingSession]);
```

Do **not** Soft→Hard snap in this effect — that is Task 3.

- [ ] **Step 2: Slice turns and render spacer**

Replace `turns.map` with:

```tsx
const visibleTurns = turns.slice(windowStart);
const heights = getTurnWindowState(activeTabId).heights;
const topSpacerPx = spacerHeightPx(windowStart, heights);

// inside scroll container, before sections:
{windowStart > 0 && (
  <div
    data-chat-turn-window-spacer
    aria-hidden
    style={{ height: topSpacerPx }}
  />
)}
{visibleTurns.map((turn, localIdx) => {
  const turnIdx = windowStart + localIdx;
  // ... same section body ...
  // TurnFooter turnIndex={turnIdx}  // ABSOLUTE
  // key uses absolute turnIdx
})}
```

- [ ] **Step 3: Measure mounted turn heights**

On each mounted `<section>`, attach a callback ref / `ResizeObserver`:

```ts
function observeTurnHeight(tabId: string, turnIndex: number, el: HTMLElement | null) {
  if (!el) return;
  const ro = new ResizeObserver(() => {
    const h = el.getBoundingClientRect().height;
    setTurnHeight(tabId, turnIndex, h);
  });
  ro.observe(el);
  return () => ro.disconnect();
}
```

Keep `lastTurnRef` on the last **absolute** turn (still `localIdx === visibleTurns.length - 1`).

- [ ] **Step 4: Smoke-check TypeScript**

Run: `pnpm exec tsc --noEmit`

Expected: no new errors in touched files

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modules/chat/chat-messages.tsx
git commit -m "$(cat <<'EOF'
feat(chat): mount only turn-window slice with height spacer

Render [windowStart..] turns and preserve absolute turnIndex for checkpoints.
EOF
)"
```

---

### Task 3: Soft→Hard snap at turn boundaries when following bottom

**Files:**
- Modify: `src/renderer/components/modules/chat/chat-messages.tsx`
- Modify: `tests/renderer/turn-window.test.ts` (edge cases already in Task 1; add `resetTurnWindowState` usage test if needed)

**Interfaces:**
- Consumes: `maybeSnapWindowStart`, `TURN_WINDOW_SENTINEL_SUPPRESS_MS`
- Produces: after stream end / new user turn, while `shouldAutoScrollRef.current`, update `windowStart`

- [ ] **Step 1: Add snap effect**

```tsx
import { maybeSnapWindowStart, setTurnWindowStart, TURN_WINDOW_SENTINEL_SUPPRESS_MS } from "@/lib/chat/turn-window";

const suppressSentinelUntilRef = useRef(0);

const applySnapIfNeeded = useCallback(() => {
  if (!activeTabId) return;
  const next = maybeSnapWindowStart({
    totalTurns: turns.length,
    windowStart,
    followingBottom: shouldAutoScrollRef.current,
    isStreaming,
  });
  if (next !== windowStart) {
    setTurnWindowStart(activeTabId, next);
    setWindowStartState(next);
    suppressSentinelUntilRef.current = Date.now() + TURN_WINDOW_SENTINEL_SUPPRESS_MS;
  }
}, [activeTabId, turns.length, windowStart, isStreaming]);
```

Call `applySnapIfNeeded`:

1. In the existing effect that runs when `wasStreaming && !isStreaming && shouldAutoScrollRef.current` (after stream completes)
2. In the new-user-message `useLayoutEffect` after pin (user just sent; following is true)

Do **not** call it from the `displayMessages` stream-follow rAF effect.

- [ ] **Step 2: Snap when FAB returns to live edge**

In `returnToActiveTurn`, after scrolling, call `applySnapIfNeeded()` (rAF once so scroll flags settle):

```tsx
requestAnimationFrame(() => {
  shouldAutoScrollRef.current = true;
  applySnapIfNeeded();
});
```

- [ ] **Step 3: Manual logic check via unit tests already covering maybeSnapWindowStart**

Run: `pnpm exec vitest run tests/renderer/turn-window.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/modules/chat/chat-messages.tsx
git commit -m "$(cat <<'EOF'
feat(chat): snap turn window Soft→Hard at live edge

Converge mounted turns after stream end / send / scroll-to-latest when following.
EOF
)"
```

---

### Task 4: Top sentinel page-up + prepend scroll restore

**Files:**
- Modify: `src/renderer/components/modules/chat/chat-messages.tsx`
- Uses: `captureSentinelScrollAnchor`, `restoreSentinelScrollAnchor` from `@/lib/chat/active-turn-scroll` (already exported via `@/lib/chat`)

**Interfaces:**
- Consumes: `pageUpWindowStart`, sentinel helpers, `suppressSentinelUntilRef`
- Produces: scroll-up remounts `PAGE` older turns without jumping

- [ ] **Step 1: Add sentinel element**

Above the spacer (or as first child of the inner `max-w-3xl` column):

```tsx
{windowStart > 0 && (
  <div
    ref={topSentinelRef}
    data-chat-turn-window-sentinel
    aria-hidden
    className="h-px w-full"
  />
)}
```

- [ ] **Step 2: IntersectionObserver page-up**

```tsx
const loadingOlderRef = useRef(false);

useEffect(() => {
  const root = scrollRef.current;
  const target = topSentinelRef.current;
  if (!root || !target || windowStart <= 0) return;

  const io = new IntersectionObserver(
    (entries) => {
      const hit = entries.some((e) => e.isIntersecting);
      if (!hit) return;
      if (loadingOlderRef.current) return;
      if (Date.now() < suppressSentinelUntilRef.current) return;
      // Ignore while streaming and forced-following
      if (isStreamingRef.current && shouldAutoScrollRef.current) return;

      loadingOlderRef.current = true;
      const anchor = captureSentinelScrollAnchor(root);
      const next = pageUpWindowStart(windowStart);
      if (activeTabId) setTurnWindowStart(activeTabId, next);
      setWindowStartState(next);
      requestAnimationFrame(() => {
        restoreSentinelScrollAnchor(root, anchor);
        loadingOlderRef.current = false;
        // Optional chained load: if still at top and next > 0, observer will fire again
      });
    },
    { root, rootMargin: "80px 0px 0px 0px", threshold: 0 },
  );
  io.observe(target);
  return () => io.disconnect();
}, [windowStart, activeTabId, turns.length]);
```

**Sentinel vs spacer note:** Prefer capturing a **mounted turn section** as sentinel (not the spacer div). `captureSentinelScrollAnchor` walks `container.children` — today the structure is one wrapper `div.max-w-3xl` containing sections. Ensure the scroll container’s direct children include identifiable turn nodes, **or** pass the inner column as the container for capture/restore. Simplest fix: put sentinel + spacer + sections as **direct children** of `data-chat-scroll` (move `max-w-3xl` classes onto each section / a fragment-free structure), OR change capture to accept a `contentRoot` element.

Recommended structure:

```tsx
<div ref={scrollRef} data-chat-scroll className="absolute inset-0 overflow-y-auto ...">
  <div ref={contentRef} className="w-full min-w-0 max-w-3xl mx-auto">
    {sentinel}
    {spacer}
    {visible sections}
  </div>
</div>
```

And call:

```ts
captureSentinelScrollAnchor(contentRef.current!)
restoreSentinelScrollAnchor(contentRef.current!, anchor)
```

only if helpers are updated to use that element’s children **and** adjust using the scrollable `scrollRef`’s `scrollTop`. Prefer extending helpers:

```ts
// In active-turn-scroll.ts — additive overload used by chat windowing
export function captureSentinelScrollAnchor(
  scrollContainer: HTMLElement,
  contentRoot: HTMLElement = scrollContainer,
): SentinelsScrollAnchor

export function restoreSentinelScrollAnchor(
  scrollContainer: HTMLElement,
  anchor: SentinelsScrollAnchor,
  contentRoot?: HTMLElement, // unused if sentinel element identity is enough
): void
```

Walk `contentRoot.children` for sentinel; still mutate `scrollContainer.scrollTop` on restore. Add a small unit test in `tests/renderer/active-turn-scroll-sentinel.test.ts` with jsdom elements if feasible; otherwise keep behavior covered manually.

- [ ] **Step 3: Add sentinel helper test (jsdom)**

```ts
// tests/renderer/active-turn-scroll-sentinel.test.ts
import { describe, expect, it } from "vitest";
import {
  captureSentinelScrollAnchor,
  restoreSentinelScrollAnchor,
} from "../../src/renderer/lib/chat/active-turn-scroll";

describe("sentinel scroll anchor", () => {
  it("restores scrollTop after prepending a block", () => {
    const scroll = document.createElement("div");
    Object.defineProperty(scroll, "clientHeight", { value: 200 });
    scroll.style.overflow = "auto";
    scroll.style.height = "200px";
    const content = document.createElement("div");
    scroll.appendChild(content);
    document.body.appendChild(scroll);

    const a = document.createElement("div");
    a.style.height = "300px";
    const b = document.createElement("div");
    b.style.height = "300px";
    content.append(a, b);
    scroll.scrollTop = 300;

    const anchor = captureSentinelScrollAnchor(scroll, content);
    const prepend = document.createElement("div");
    prepend.style.height = "250px";
    content.insertBefore(prepend, content.firstChild);
    restoreSentinelScrollAnchor(scroll, anchor);
    // Best-effort: scrollTop should increase ~prepend height when sentinel is `a`
    expect(scroll.scrollTop).toBeGreaterThanOrEqual(300);
  });
});
```

If jsdom layout makes getBoundingClientRect zeros, skip DOM test and rely on manual QA — but still implement the two-arg helper.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm exec vitest run tests/renderer/turn-window.test.ts tests/renderer/active-turn-scroll-sentinel.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS (or sentinel test skipped with documented reason)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/chat/active-turn-scroll.ts src/renderer/components/modules/chat/chat-messages.tsx tests/renderer/active-turn-scroll-sentinel.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): load older turns on scroll-up with sentinel restore

Page up by PAGE turns and preserve viewport via content-root sentinel anchors.
EOF
)"
```

---

### Task 5: Tab close cleanup + changelog + acceptance pass

**Files:**
- Modify: `src/renderer/stores/chat-store.ts` (`closeTab` path)
- Modify: `changelog/0.5.x.md`
- Optional: export `clearTurnWindowState` usage only

- [ ] **Step 1: Clear window state on closeTab**

In `closeTab` after removing the tab:

```ts
import { clearTurnWindowState } from "../lib/chat/turn-window";
// path alias from store — use relative or `@/lib/chat/turn-window`
clearTurnWindowState(id);
```

Also clear the `initializedTabs` Set entry — move that Set into `turn-window.ts`:

```ts
const initializedTabs = new Set<string>();

export function markTurnWindowInitialized(tabId: string): void {
  initializedTabs.add(tabId);
}
export function isTurnWindowInitialized(tabId: string): boolean {
  return initializedTabs.has(tabId);
}
// clearTurnWindowState also deletes from initializedTabs
```

Update Task 2 resolve logic to use these helpers (refactor if Task 2 used a module Set in chat-messages).

- [ ] **Step 2: Changelog bullet under 0.5.13**

```markdown
### AI Chat

- Long sessions mount a Soft/Hard sliding window of turns (DOM only): keep chatting at the bottom without rendering the full history; scroll up to remount older turns in pages of 7
```

- [ ] **Step 3: Full targeted test run**

Run:

```bash
pnpm exec vitest run tests/renderer/turn-window.test.ts tests/renderer/active-turn-scroll-sentinel.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Manual acceptance checklist**

1. Session with ≤14 turns — looks unchanged  
2. Grow past 14 while at bottom — after a completed turn, older turns unmount; spacer grows; follow still works  
3. Scroll up — ~7 older turns remount; little/no jump  
4. Stream a long reply — window does not snap mid-stream  
5. Scroll up, then send — pin to live edge, then snap  
6. Checkpoint restore on a mounted turn — still works (absolute index)  
7. Switch chat tabs — only active tab renders; return restores windowStart  

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stores/chat-store.ts src/renderer/lib/chat/turn-window.ts src/renderer/components/modules/chat/chat-messages.tsx changelog/0.5.x.md
git commit -m "$(cat <<'EOF'
chore(chat): clear turn-window state on tab close and note in changelog

Phase 1 Soft/Hard chat turn windowing is complete for long-session smoothness.
EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| HARD/SOFT/PAGE constants + turn unit | Task 1 |
| initial window rules | Task 1–2 |
| Soft→Hard snap at turn boundary when following | Task 3 |
| No snap on stream deltas / while reading history | Task 1 math + Task 3 call sites |
| Scroll-up PAGE + sentinel restore | Task 4 |
| Spacer + height ledger | Task 1–2 |
| Suppress sentinel after snap | Task 3–4 |
| Absolute turnIndex / checkpoint | Task 2 |
| Full messages retained; no sessionLoadWindow | all (explicit non-goals) |
| Inactive tab memory untouched | all |
| Changelog 0.5.13 | Task 5 |
| Acceptance checklist | Task 5 |

## Out of scope (do not implement in this plan)

- Phase 2 `sessionLoadWindow` / store trim
- Virtuoso
- Trimming inactive-tab `messages[]`
