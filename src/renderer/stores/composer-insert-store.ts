import { create } from "zustand";
import type { ComposerPart } from "@/lib/chat/composer-parts";
import {
  contextInsertToPart,
  legacyTerminalRequest,
  type ContextInsertRequest,
  type LegacyTerminalSnippetRequest,
} from "@/lib/chat/context-insert";

interface ComposerInsertState {
  pendingInsert: ContextInsertRequest | null;
  nonce: number;
  requestInsert: (req: ContextInsertRequest) => void;
  consumeInsert: () => ContextInsertRequest | null;
  /** @deprecated Use requestInsert with kind: "terminal" */
  requestTerminalSnippet: (req: LegacyTerminalSnippetRequest) => void;
  /** @deprecated Use consumeInsert */
  consumeTerminalSnippet: () => LegacyTerminalSnippetRequest | null;
}

export function contextInsertToComposerPart(req: ContextInsertRequest): ComposerPart {
  return contextInsertToPart(req);
}

/** @deprecated Use contextInsertToComposerPart */
export const terminalSnippetToPart = contextInsertToComposerPart;

export const useComposerInsertStore = create<ComposerInsertState>()((set, get) => ({
  pendingInsert: null,
  nonce: 0,

  requestInsert: (req) => {
    set((s) => ({
      pendingInsert: req,
      nonce: s.nonce + 1,
    }));
  },

  consumeInsert: () => {
    const pending = get().pendingInsert;
    if (!pending) return null;
    set({ pendingInsert: null });
    return pending;
  },

  requestTerminalSnippet: (req) => {
    get().requestInsert(legacyTerminalRequest(req));
  },

  consumeTerminalSnippet: () => {
    const pending = get().consumeInsert();
    if (!pending || pending.kind !== "terminal") return null;
    const { kind: _kind, ...rest } = pending;
    return rest;
  },
}));
