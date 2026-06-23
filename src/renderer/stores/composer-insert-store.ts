import { create } from "zustand";
import { createTokenId, type ComposerPart } from "@/lib/chat/composer-parts";
import { terminalTabLabelFromCommand } from "@/lib/terminal/root";
import { truncateTerminalOutput } from "@/lib/terminal/ai-mirror";

export interface TerminalSnippetRequest {
  command?: string;
  output: string;
  exitCode?: number;
  cwd?: string;
  sourceTabId?: string;
  selection?: string;
}

interface ComposerInsertState {
  pendingTerminalSnippet: TerminalSnippetRequest | null;
  nonce: number;
  requestTerminalSnippet: (req: TerminalSnippetRequest) => void;
  consumeTerminalSnippet: () => TerminalSnippetRequest | null;
}

export function terminalSnippetToPart(req: TerminalSnippetRequest): ComposerPart {
  const command = req.command?.trim();
  const output = truncateTerminalOutput(req.output || req.selection || "");
  const label = command
    ? `$ ${terminalTabLabelFromCommand(command, 32)}`
    : "Terminal output";
  return {
    type: "terminal-snippet",
    id: createTokenId(),
    label,
    command,
    output,
    exitCode: req.exitCode,
    cwd: req.cwd,
    sourceTabId: req.sourceTabId,
  };
}

export const useComposerInsertStore = create<ComposerInsertState>()((set, get) => ({
  pendingTerminalSnippet: null,
  nonce: 0,

  requestTerminalSnippet: (req) => {
    set((s) => ({
      pendingTerminalSnippet: req,
      nonce: s.nonce + 1,
    }));
  },

  consumeTerminalSnippet: () => {
    const pending = get().pendingTerminalSnippet;
    if (!pending) return null;
    set({ pendingTerminalSnippet: null });
    return pending;
  },
}));
