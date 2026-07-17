# Chat turn sliding window — design

Date: 2026-07-18

## Goal

Long AI Chat sessions currently mount every turn’s markdown/DOM, which causes jank and high CPU/memory once a session grows. Phase 1 keeps full message data in Zustand but only **mounts a sliding window of turns**, so the bottom of an active conversation stays smooth. Scrolling up progressively remounts older turns; returning to the bottom re-applies the window.

## Problem (current)

- Store: flat `TabState.messages: ChatStreamMessage[]` (complete history per open tab).
- UI: `chat-messages.tsx` groups into **visible user turns** and `turns.map` mounts all of them.
- Markdown path (react-markdown + KaTeX + Shiki) is expensive; streaming re-renders the list (old turns rely on `memo`).
- No chat list virtualization. `react-virtuoso` exists in the repo but is unused for chat.
- Multi-tab: only the **active** tab projects into `s.messages` / `ChatMessages` (DOM already unmounts inactive tabs). Inactive tabs still keep full `messages[]` in memory.
- Half-ready pieces: main `session:loadWindow` / preload APIs; sentinel prepend scroll helpers — not wired into chat UI.

## Decisions

| Topic | Choice |
|-------|--------|
| Approach | Custom **turn sliding window** (not Virtuoso, not CSS-only `content-visibility`) |
| Cache meaning (Phase 1) | Unmount React/DOM + height spacer; **do not** delete messages from store |
| Memory pagination (Phase 2) | `sessionLoadWindow` + trim store — documented, not in Phase 1 |
| Inactive tabs (Phase 1) | Keep full `messages[]`; no memory trim on tab switch |
| Window unit | Visible user turn (same rules as `chat-turns.ts` / `countUserTurns`) |
| Snap cadence | Hysteresis Soft→Hard at turn boundaries when following bottom — **not** every stream delta |

## Constants

| Name | Value | Meaning |
|------|-------|---------|
| `HARD` | 7 | After snap, mount only the last N turns |
| `SOFT` | 14 | Snap only when mounted count exceeds this |
| `PAGE` | 7 | Turns remounted per scroll-up load |

Values are tunable constants in one place.

## Phase 1 — Turn window (in scope)

### Window state (per chat tab)

- `windowStart`: inclusive index of earliest mounted turn
- `windowEnd`: inclusive; always includes the latest turn (including streaming)
- Mounted range: `[windowStart, windowEnd]`
- `turnHeights[i]`: last measured height for spacer accounting

### Algorithm

1. **Open session / switch to tab / initial**  
   - `totalTurns ≤ SOFT` → `windowStart = 0` (full mount)  
   - `totalTurns > SOFT` → `windowStart = totalTurns - HARD`

2. **Snap (Soft → Hard)**  
   - Trigger only when:
     - user is following the bottom (or equivalent “at live edge”), **and**
     - at a **turn boundary** (new user turn committed / stream finished for that turn), **and**
     - `mountedCount = windowEnd - windowStart + 1 > SOFT`
   - Then: `windowStart = totalTurns - HARD`
   - Do **not** snap on every stream delta
   - Do **not** snap while the user is reading history (not following bottom); snap when they return to bottom (FAB / send that pins to live edge)

3. **Scroll-up page load**  
   - Top sentinel enters view and `windowStart > 0` →  
     `windowStart = max(0, windowStart - PAGE)`
   - Restore scroll with existing sentinel / prepend anchor helpers
   - Throttle: one load at a time; allow chained load if still pinned to top after restore
   - While streaming with forced follow: ignore top sentinel

4. **Data**  
   - `tabs[].messages` remains complete in Phase 1  
   - “Cache” = unmounted DOM + optional spacer, not deletion

### Scroll / layout

Top → bottom inside the chat scroll container (`data-chat-scroll`):

1. Top sentinel (triggers PAGE expand when `windowStart > 0`)
2. Upper spacer: sum of measured (or estimated) heights for turns `< windowStart`
3. Mounted turn sections (existing sticky `UserHeader`, tool cards, `TurnFooter`, last-turn runway)
4. Existing bottom behaviors: `pinActiveTurnTop`, `followActiveTurnTail`, scroll-to-end FAB

Height ledger:

- Measure mounted turns (`ResizeObserver` / layout effect); keep last height after unmount for spacer
- Remount may correct spacer by a few px; large jumps use sentinel restore
- After a bottom snap, briefly suppress top-sentinel loads so the just-unmounted page is not immediately remounted

Preserve existing product scroll behavior; do not introduce Virtuoso.

### Boundaries

| Case | Behavior |
|------|----------|
| Streaming | Latest turn always mounted; no Soft→Hard snap on deltas; ignore top sentinel while forced-following |
| Checkpoint / `truncateToTurn` / restore | Still operate on full `messages[]`; after restore, recompute `windowStart` per initial rules |
| TurnFooter on older turns | Only on mounted turns; user scrolls up to remount, then restore |
| `toolResultMap` | Phase 1 may still scan full `messages` (acceptable); store trim is Phase 2 |
| Thinking persistKey / tool expand anchors | Unaffected by unmount; remount rereads local state; expand anchors only apply to mounted nodes |
| Tab switch | Only active tab mounts `ChatMessages` (unchanged). Per-tab `windowStart` / `turnHeights` restored on reactivation; if missing, apply initial rules |

### Code homes

| Concern | Home |
|---------|------|
| Constants + window math (start/snap/page) | `src/renderer/lib/chat/` (e.g. `turn-window.ts`), aligned with `chat-turns` / scroll helpers |
| Slice render + spacer + sentinel wiring | `chat-messages.tsx` |
| Prepend scroll restore | Existing `preserve-viewport-anchor` / sentinel helpers (wire up) |
| Per-tab window UI state | Light fields on tab state or a small colocated store — must not churn the streaming message hot path |
| Tests | `tests/renderer/`: snap, page-up, no snap while streaming, no snap when not at bottom |

### Out of scope (Phase 1)

- `react-virtuoso` for chat
- Windowing by raw message count
- Snapping every turn without Soft hysteresis
- Deleting or truncating history from the store
- Trimming inactive-tab memory
- Wiring `sessionLoadWindow` into the renderer chat path

## Phase 2 — Store / IPC window (out of scope for implementation now)

Same turn indices as Phase 1:

- Keep only a neighborhood of turns in renderer memory for the active (and optionally inactive) tabs
- Hydrate older pages via existing `session:loadWindow` / `sessionLoadWindow`
- Revisit `toolResultMap`, checkpoint restore, and empty-tab resync for partial hydrate

Phase 1 APIs should expose turn-index window bounds so Phase 2 is additive, not a rewrite.

## Acceptance

1. Short sessions (`≤ SOFT` turns): indistinguishable from today (all turns visible).
2. Long sessions at the bottom: mounted turns stay near Soft, then converge to about Hard; follow-tail remains stable.
3. Scroll up: about `PAGE` older turns remount per load; scroll position stable (or only tiny spacer corrections).
4. During streaming: history is not suddenly unmounted; snap only after turn boundary while following bottom.
5. Reading history then sending: return to bottom first, then snap.
6. Checkpoint restore: window recomputed correctly.
7. Tab switch: inactive tabs still not rendered; returning restores sensible window state; Phase 1 does not trim inactive `messages[]`.

Success metric: hundred-turn sessions feel clearly smoother when following the stream / sending at the bottom (qualitative DevTools comparison welcome).

## Alternatives considered

1. **Turn sliding window (chosen)** — Matches sticky headers, pin/follow, TurnFooter; Soft/Hard matches product intent; leaves Phase 2 a clear seam.
2. **`react-virtuoso` by turn** — Strong library, but high friction with sticky user headers, active-turn runway, and pin/follow scroll.
3. **`content-visibility` / IntersectionObserver only** — Small diff, unreliable for markdown/Shiki cost already paid; weak Phase 2 story.
