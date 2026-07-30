import { create } from "zustand";
import type { InlineComposerEditorHandle } from "@/components/modules/chat/inline-composer";
import { loadDraftParts, saveDraftFromParts } from "@/components/modules/chat/inline-composer/draft-utils";
import {
  contextInsertToComposerPart,
  useComposerInsertStore,
} from "@/stores/composer-insert-store";
import { useChatStore } from "@/stores/chat-store";
import type { ComposerPart } from "@/lib/chat/composer-parts";
import { isComposerEmpty, mergeAdjacentText, composerNeedsExpandedLayout } from "@/lib/chat/composer-parts";

const DRAFT_PERSIST_MS = 250;

interface ComposerEditorState {
  handle: InlineComposerEditorHandle | null;
  /** Live empty flag — updated every keystroke without touching chat-store tabs. */
  draftEmpty: boolean;
  /** Live multiline flag for AiBar capsule expand/shrink. */
  draftNeedsExpanded: boolean;
  register: (handle: InlineComposerEditorHandle | null) => void;
  flushPendingInsert: () => boolean;
  /** Persist parts to tab draft (debounced) + refresh live UI flags immediately. */
  scheduleDraftPersist: (tabId: string, parts: ComposerPart[]) => void;
  /** Write draft + UI flags immediately (send/clear — no 250ms lag in the input). */
  replaceDraftNow: (tabId: string, parts: ComposerPart[]) => void;
  flushDraftPersist: () => void;
}

let draftPersistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDraftPersist: { tabId: string; parts: ComposerPart[] } | null = null;

function commitDraftPersist(): void {
  if (draftPersistTimer) {
    clearTimeout(draftPersistTimer);
    draftPersistTimer = null;
  }
  const pending = pendingDraftPersist;
  pendingDraftPersist = null;
  if (!pending) return;
  useChatStore.getState().saveDraft(pending.tabId, saveDraftFromParts(pending.parts));
}

/** Immediate draft write — used on send/clear so the composer empties synchronously. */
function commitDraftImmediate(
  tabId: string,
  parts: ComposerPart[],
  patchFlags: (empty: boolean, needsExpanded: boolean) => void,
): void {
  if (draftPersistTimer) {
    clearTimeout(draftPersistTimer);
    draftPersistTimer = null;
  }
  pendingDraftPersist = null;
  useChatStore.getState().saveDraft(tabId, saveDraftFromParts(parts));
  patchFlags(isComposerEmpty(parts), composerNeedsExpandedLayout(parts));
}

/** Write a context token into the tab draft when the composer editor is not mounted yet. */
export function appendContextPartToActiveDraft(part: ComposerPart): void {
  const chat = useChatStore.getState();
  const tab = chat.tabs.find((t) => t.id === chat.activeTabId);
  const draft = loadDraftParts(tab?.draft);
  const next = isComposerEmpty(draft)
    ? [part]
    : mergeAdjacentText([...draft, part]);
  chat.saveDraft(chat.activeTabId, saveDraftFromParts(next));
}

function applyPendingInsert(handle: InlineComposerEditorHandle | null): boolean {
  const insertStore = useComposerInsertStore.getState();
  if (!insertStore.pendingInsert) return false;
  const part = contextInsertToComposerPart(insertStore.pendingInsert);
  if (
    part.type !== "terminal-snippet" &&
    part.type !== "code-snippet" &&
    part.type !== "git-diff-snippet" &&
    part.type !== "paper-snippet" &&
    part.type !== "experiment-run"
  ) {
    insertStore.consumeInsert();
    return true;
  }

  if (!handle) {
    appendContextPartToActiveDraft(part);
    insertStore.consumeInsert();
    return true;
  }

  const inserted = handle.insertContextPart(part);
  if (inserted) insertStore.consumeInsert();
  return inserted;
}

export const useComposerEditorStore = create<ComposerEditorState>()((set, get) => ({
  handle: null,
  draftEmpty: true,
  draftNeedsExpanded: false,

  scheduleDraftPersist: (tabId, parts) => {
    const empty = isComposerEmpty(parts);
    const needsExpanded = composerNeedsExpandedLayout(parts);
    const prev = get();
    if (prev.draftEmpty !== empty || prev.draftNeedsExpanded !== needsExpanded) {
      set({ draftEmpty: empty, draftNeedsExpanded: needsExpanded });
    }
    pendingDraftPersist = { tabId, parts };
    if (draftPersistTimer) clearTimeout(draftPersistTimer);
    draftPersistTimer = setTimeout(commitDraftPersist, DRAFT_PERSIST_MS);
  },

  flushDraftPersist: () => {
    commitDraftPersist();
  },

  replaceDraftNow: (tabId, parts) => {
    commitDraftImmediate(tabId, parts, (empty, needsExpanded) => {
      set({ draftEmpty: empty, draftNeedsExpanded: needsExpanded });
    });
    get().handle?.replaceParts(parts);
  },

  register: (handle) => {
    set({ handle });
    if (handle) applyPendingInsert(handle);
  },

  flushPendingInsert: () => applyPendingInsert(get().handle),
}));
