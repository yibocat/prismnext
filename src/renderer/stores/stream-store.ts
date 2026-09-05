import { create } from "zustand";
import type { ContentBlock } from "@/lib/chat/types";
import { applyAssistantEventToBlocks } from "@shared/agent/conversation-blocks";
import type { AgentEvent } from "@shared/agent/runtime";

/**
 * Per-tab streaming state, SEPARATE from chat-store.
 *
 * Rationale: text/thinking/tool_progress deltas arrive at display rate
 * (~1 coalesced batch per animation frame). Routing them through
 * chat-store meant every delta rebuilt `tabs`, `conversation` and every
 * downstream memo. This store holds ONLY the live turn's assistant blocks;
 * chat-store's `conversation.live.assistant.blocks` is synced from here on
 * tool-lifecycle events and rehydrated into the reducer just before the
 * terminal event commits the turn.
 *
 * Invariants:
 *  - `blocks` is the single source of truth for the live turn's assistant
 *    content while `turnId` matches the streaming turn.
 *  - Deltas for a stale/absent turn are dropped (mirrors the reducer's
 *    LATE_DROPPABLE guard).
 *  - Non-delta events always win: chat-store's reducer result is copied
 *    back over `blocks` (see `_applyAgentEvent`).
 */

interface StreamTabState {
  turnId: string | null;
  blocks: ContentBlock[];
  version: number;
}

interface StreamState {
  byTab: Record<string, StreamTabState>;

  /** Seed (or reset) the live blocks for a turn. */
  beginTurn: (tabId: string, turnId: string) => void;
  /** Apply a delta-class event to the live blocks. Returns true when applied. */
  applyDelta: (tabId: string, event: AgentEvent) => boolean;
  /** Replace blocks wholesale (alignment with chat-store's reducer). */
  setBlocks: (tabId: string, turnId: string, blocks: ContentBlock[]) => void;
  /** Snapshot current blocks for a turn (null when turnId differs / absent). */
  blocksFor: (tabId: string, turnId: string) => ContentBlock[] | null;
  /** Clear the tab's stream state (turn committed / tab closed). */
  endTurn: (tabId: string) => void;
}

const EMPTY_TAB: StreamTabState = { turnId: null, blocks: [], version: 0 };

export const useStreamStore = create<StreamState>((set, get) => ({
  byTab: {},

  beginTurn: (tabId, turnId) => {
    set((s) => {
      const prev = s.byTab[tabId];
      if (prev && prev.turnId === turnId) return s;
      return {
        byTab: {
          ...s.byTab,
          [tabId]: { turnId, blocks: [], version: (prev?.version ?? 0) + 1 },
        },
      };
    });
  },

  applyDelta: (tabId, event) => {
    const state = get().byTab[tabId];
    // Mirror the reducer's late-delta guard: only the live turn accepts deltas.
    if (!state?.turnId || state.turnId !== event.turnId) return false;
    const nextBlocks = applyAssistantEventToBlocks(state.blocks, event);
    if (nextBlocks === state.blocks) return false;
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: {
          turnId: state.turnId,
          blocks: nextBlocks,
          version: state.version + 1,
        },
      },
    }));
    return true;
  },

  setBlocks: (tabId, turnId, blocks) => {
    set((s) => {
      const prev = s.byTab[tabId];
      if (prev && prev.turnId === turnId && prev.blocks === blocks) return s;
      return {
        byTab: {
          ...s.byTab,
          [tabId]: {
            turnId,
            blocks,
            version: (prev?.version ?? 0) + 1,
          },
        },
      };
    });
  },

  blocksFor: (tabId, turnId) => {
    const state = get().byTab[tabId];
    if (!state || state.turnId !== turnId) return null;
    return state.blocks;
  },

  endTurn: (tabId) => {
    set((s) => {
      if (!s.byTab[tabId]) return s;
      const next = { ...s.byTab };
      delete next[tabId];
      return { byTab: next };
    });
  },
}));

/** Non-reactive read for event-pipeline code. */
export function streamTabState(tabId: string): StreamTabState {
  return useStreamStore.getState().byTab[tabId] ?? EMPTY_TAB;
}
