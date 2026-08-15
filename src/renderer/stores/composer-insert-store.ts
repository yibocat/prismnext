import { create } from "zustand";
import type { ComposerPart } from "@/lib/chat/composer-parts";
import {
  contextInsertToPart,
  legacyTerminalRequest,
  type ContextInsertRequest,
  type LegacyTerminalSnippetRequest,
} from "@/lib/chat/context-insert";

interface ComposerInsertState {
  pendingInserts: ContextInsertRequest[];
  nonce: number;
  requestInsert: (req: ContextInsertRequest) => void;
  requestInserts: (reqs: ContextInsertRequest[]) => void;
  consumeInsert: () => ContextInsertRequest | null;
  /** Absolute paths queued for composer attachment (drag-drop from chat surface). */
  pendingAttachPaths: string[] | null;
  attachNonce: number;
  requestAttachPaths: (paths: string[]) => void;
  consumeAttachPaths: () => string[] | null;
  /** Live count of chips in the active composer (for AiBar collapse/restore). */
  composerAttachmentCount: number;
  setComposerAttachmentCount: (n: number) => void;
  /** @deprecated Use requestInsert with kind: "terminal" */
  requestTerminalSnippet: (req: LegacyTerminalSnippetRequest) => void;
  /** @deprecated Use consumeInsert */
  consumeTerminalSnippet: () => LegacyTerminalSnippetRequest | null;
}

export function contextInsertToComposerPart(
  req: ContextInsertRequest,
): Exclude<ComposerPart, { type: "text" }> {
  return contextInsertToPart(req);
}

/** @deprecated Use contextInsertToComposerPart */
export const terminalSnippetToPart = contextInsertToComposerPart;

export const useComposerInsertStore = create<ComposerInsertState>()((set, get) => ({
  pendingInserts: [],
  nonce: 0,
  pendingAttachPaths: null,
  attachNonce: 0,
  composerAttachmentCount: 0,

  requestInsert: (req) => {
    set((s) => ({
      pendingInserts: [...s.pendingInserts, req],
      nonce: s.nonce + 1,
    }));
  },

  requestInserts: (reqs) => {
    if (reqs.length === 0) return;
    set((s) => ({
      pendingInserts: [...s.pendingInserts, ...reqs],
      nonce: s.nonce + 1,
    }));
  },

  consumeInsert: () => {
    const queue = get().pendingInserts;
    if (queue.length === 0) return null;
    const [first, ...rest] = queue;
    set({ pendingInserts: rest });
    return first;
  },

  requestAttachPaths: (paths) => {
    const cleaned = paths.map((p) => p.trim()).filter(Boolean);
    if (cleaned.length === 0) return;
    set((s) => ({
      pendingAttachPaths: cleaned,
      attachNonce: s.attachNonce + 1,
    }));
  },

  consumeAttachPaths: () => {
    const pending = get().pendingAttachPaths;
    if (!pending?.length) return null;
    set({ pendingAttachPaths: null });
    return pending;
  },

  setComposerAttachmentCount: (n) => {
    set({ composerAttachmentCount: Math.max(0, n) });
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
