import { create } from "zustand";
import type { InlineComposerEditorHandle } from "@/components/modules/chat/inline-composer";
import { loadDraftParts, saveDraftFromParts } from "@/components/modules/chat/inline-composer/draft-utils";
import {
  contextInsertToComposerPart,
  useComposerInsertStore,
} from "@/stores/composer-insert-store";
import { useChatStore } from "@/stores/chat-store";
import type { ComposerPart } from "@/lib/chat/composer-parts";
import { isComposerEmpty, mergeAdjacentText } from "@/lib/chat/composer-parts";

interface ComposerEditorState {
  handle: InlineComposerEditorHandle | null;
  register: (handle: InlineComposerEditorHandle | null) => void;
  flushPendingInsert: () => boolean;
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
    part.type !== "git-diff-snippet"
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

  register: (handle) => {
    set({ handle });
    if (handle) applyPendingInsert(handle);
  },

  flushPendingInsert: () => applyPendingInsert(get().handle),
}));
