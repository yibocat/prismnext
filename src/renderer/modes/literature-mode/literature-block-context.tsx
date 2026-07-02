import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PaperExtractBlock } from "../../../shared/paper-extract-block";
import {
  buildBlockPlacementsByPage,
  getFlowGroupMembers,
  type BlockPagePlacement,
} from "../../../shared/paper-extract-block";
import type { PdfTextExcerpt } from "./literature-pdf-excerpt";

interface LiteratureBlockContextValue {
  blocks: PaperExtractBlock[];
  hasBlocks: boolean;
  hoveredBlockId: string | null;
  setHoveredBlockId: (id: string | null) => void;
  /** Shift+Click / block-mode picks (supports multiple). */
  selectedBlockIds: string[];
  selectedBlocks: PaperExtractBlock[];
  toggleBlockSelection: (block: PaperExtractBlock, shiftKey?: boolean) => void;
  clearBlockSelection: () => void;
  /** Queued text excerpts for multi-segment highlight-then-add flow. */
  textExcerptQueue: PdfTextExcerpt[];
  /** After first "Keep selecting", panel stays until Send / Insert / Dismiss. */
  excerptSessionActive: boolean;
  addTextExcerpt: (excerpt: PdfTextExcerpt) => void;
  clearTextExcerptQueue: () => void;
  blockPickMode: boolean;
  setBlockPickMode: (on: boolean) => void;
  blocksByPage: Map<number, BlockPagePlacement[]>;
}

const LiteratureBlockContext = createContext<LiteratureBlockContextValue | null>(null);

export function LiteratureBlockProvider({
  blocks,
  children,
}: {
  blocks: PaperExtractBlock[];
  children: ReactNode;
}) {
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [textExcerptQueue, setTextExcerptQueue] = useState<PdfTextExcerpt[]>([]);
  const [excerptSessionActive, setExcerptSessionActive] = useState(false);
  const [blockPickMode, setBlockPickMode] = useState(false);

  const blocksById = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);

  const blocksByPage = useMemo(() => buildBlockPlacementsByPage(blocks), [blocks]);

  const selectedBlocks = useMemo(
    () =>
      selectedBlockIds
        .map((id) => blocksById.get(id))
        .filter((b): b is PaperExtractBlock => Boolean(b))
        .sort((a, b) => a.index - b.index),
    [selectedBlockIds, blocksById],
  );

  const toggleBlockSelection = useCallback(
    (block: PaperExtractBlock, shiftKey = false) => {
      const groupIds = getFlowGroupMembers(blocks, block).map((b) => b.id);
      setSelectedBlockIds((prev) => {
        const groupSelected = groupIds.every((id) => prev.includes(id));
        if (shiftKey) {
          if (groupSelected) return prev.filter((id) => !groupIds.includes(id));
          return [...new Set([...prev, ...groupIds])];
        }
        if (groupSelected && prev.length === groupIds.length) return [];
        return groupIds;
      });
    },
    [blocks],
  );

  const clearBlockSelection = useCallback(() => setSelectedBlockIds([]), []);

  const addTextExcerpt = useCallback((excerpt: PdfTextExcerpt) => {
    setTextExcerptQueue((prev) => [...prev, excerpt]);
    setExcerptSessionActive(true);
  }, []);

  const clearTextExcerptQueue = useCallback(() => {
    setTextExcerptQueue([]);
    setExcerptSessionActive(false);
  }, []);

  const value = useMemo<LiteratureBlockContextValue>(
    () => ({
      blocks,
      hasBlocks: blocks.length > 0,
      hoveredBlockId,
      setHoveredBlockId,
      selectedBlockIds,
      selectedBlocks,
      toggleBlockSelection,
      clearBlockSelection,
      textExcerptQueue,
      excerptSessionActive,
      addTextExcerpt,
      clearTextExcerptQueue,
      blockPickMode,
      setBlockPickMode,
      blocksByPage,
    }),
    [
      blocks,
      hoveredBlockId,
      selectedBlockIds,
      selectedBlocks,
      toggleBlockSelection,
      clearBlockSelection,
      textExcerptQueue,
      excerptSessionActive,
      addTextExcerpt,
      clearTextExcerptQueue,
      blockPickMode,
      blocksByPage,
    ],
  );

  return (
    <LiteratureBlockContext.Provider value={value}>{children}</LiteratureBlockContext.Provider>
  );
}

export function useLiteratureBlocks(): LiteratureBlockContextValue {
  const ctx = useContext(LiteratureBlockContext);
  if (!ctx) {
    return {
      blocks: [],
      hasBlocks: false,
      hoveredBlockId: null,
      setHoveredBlockId: () => {},
      selectedBlockIds: [],
      selectedBlocks: [],
      toggleBlockSelection: () => {},
      clearBlockSelection: () => {},
      textExcerptQueue: [],
      excerptSessionActive: false,
      addTextExcerpt: () => {},
      clearTextExcerptQueue: () => {},
      blockPickMode: false,
      setBlockPickMode: () => {},
      blocksByPage: new Map(),
    };
  }
  return ctx;
}

export function useLiteratureBlockActions() {
  const { setHoveredBlockId, toggleBlockSelection, blockPickMode } = useLiteratureBlocks();
  return { setHoveredBlockId, toggleBlockSelection, blockPickMode };
}
