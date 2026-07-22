# Session hover card redesign

**Date:** 2026-07-23  
**Status:** Approved → implement

## Goal

Chat tab / session-title hover shows session-bound facts that help orientation and navigation. Drop diagnostic noise.

## Title semantics (A)

- Display title = `resolveSessionTitle` (first user message auto-names the session; thereafter stored title).
- Treat as formal session name in UI.
- In-place rename is out of scope for this round.

## Content

| Row | Show when | Interaction |
|-----|-----------|-------------|
| Title | always | read-only |
| Checkout (branch / worktree) | always | read-only |
| Mode (Build / Plan) | always | read-only |
| Citations count | `sessionId` present | click → RightArea Literature → Session citations |
| Intensive reading count | `intensivePaperIds.length > 0` | read-only |
| Session id | — | **removed** |
| AI terminal status | — | **removed** |

## Out of scope

- Rename UI
- Expert / model / tokens / timestamps
- Click intensive → jump
- Enlarge panel for opaque ids

## Implementation homes

- `session-context-card.tsx` — layout
- `jump-to-staged-citation.ts` — `openSessionCitations(sessionId)` (no refId)
- i18n `chat.openTabs.*`
- Remove settings toggle that only controlled hover AI-terminal row
