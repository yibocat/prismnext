import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react";
import { Compartment, EditorState, EditorSelection, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import type { CommandDef } from "@commands/types";
import type { AgentProfileInfo } from "@shared/agent-profiles";
import { formatPaperMentionLabel } from "../../../../../shared/bibkey-utils";
import type { ProjectFile } from "@/stores/document-store";
import { useDocumentStore } from "@/stores/document-store";
import { mentionFileLabel } from "@/lib/files/mentionable-files";
import type { LiteraturePaper } from "@/types/electron.d";
import { useLiteratureStore } from "@/stores/literature-store";
import { useLiteratureExtractStore } from "@/stores/literature-extract-store";
import { pickBestReadySource } from "../../../../../shared/paper-extract";
import type { ComposerPart } from "@/lib/chat/composer-parts";
import {
  createTokenId,
  insertedTextTriggersLinkify,
  isComposerEmpty,
  parseTextToComposerParts,
} from "@/lib/chat/composer-parts";
import { partsToDoc, stripTokenSeparators } from "./serialize";
import {
  atomicTokenBackspace,
  atomicTokenDeleteForward,
  insertComposerToken,
  insertComposerParts,
  linkifyViewIfNeeded,
  readPartsFromView,
  repairComposerDocIfNeeded,
  composerTokenTransactionFilter,
  composerTokenAtomicRanges,
  setTokenMapEffect,
  selectionAfterDocReplace,
  syncTokenMapFromParts,
  tokenDecorationsField,
  tokenMapStateField,
} from "./token-field";
import { detectQueryAtCursor, type ComposerQuery } from "./query";
import { MentionDropdown, SlashCommandDropdown, buildSlashOptions, type SlashCatalogMcp, type SlashCatalogSkill, type SlashOption } from "./composer-dropdown";
import type { CursorAnchor } from "./dropdown-position";
import { useComposerEditorStore } from "@/stores/composer-editor-store";
import { compactComposerNeedsExpand } from "./compact-overflow";
import { syncComposerQueryState } from "./composer-query-sync";
import { loadDraftParts } from "./draft-utils";
import { useChatStore } from "@/stores/chat-store";
import type { Extension } from "@codemirror/state";

function collectInsertedText(changes: import("@codemirror/state").ChangeSet): string {
  let text = "";
  changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    text += inserted.toString();
  });
  return text;
}

const composerTheme = EditorView.theme({
  "&": {
    fontSize: "var(--font-composer)",
    backgroundColor: "transparent",
  },
  ".cm-content": {
    padding: "8px 16px",
    minHeight: "48px",
    maxHeight: "160px",
    fontFamily: "inherit",
    caretColor: "transparent",
    lineHeight: "20px",
  },
  ".cm-line": {
    padding: "0",
    lineHeight: "20px",
    minHeight: "20px",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-cursor": {
    borderLeftWidth: "1.5px",
    borderLeftColor: "var(--foreground)",
  },
  ".cm-dropCursor": {
    display: "none !important",
  },
  ".cm-cursorLayer > .cm-cursor ~ .cm-cursor": {
    display: "none !important",
  },
  "&:not(.cm-focused) .cm-cursor": {
    display: "none !important",
  },
});

const composerInlineTokenTheme = EditorView.theme({
  ".inline-composer-token": {
    display: "inline-flex",
    verticalAlign: "middle",
    alignItems: "center",
    height: "20px",
    lineHeight: "20px",
    marginInline: "1px",
  },
  ".inline-composer-token [data-inline-token]": {
    fontSize: "12px",
    padding: "0 5px",
    height: "18px",
    lineHeight: "18px",
    gap: "2px",
    borderRadius: "3px",
  },
  ".inline-composer-token [data-inline-token] svg": {
    width: "10px",
    height: "10px",
  },
});

const COMPACT_LINE_HEIGHT = "24px";

const composerCompactTheme = EditorView.theme({
  "&.cm-editor": {
    backgroundColor: "transparent",
    fontSize: "var(--font-composer)",
    maxHeight: COMPACT_LINE_HEIGHT,
  },
  ".cm-content": {
    padding: "0",
    minHeight: COMPACT_LINE_HEIGHT,
    maxHeight: COMPACT_LINE_HEIGHT,
    lineHeight: COMPACT_LINE_HEIGHT,
    caretColor: "var(--foreground)",
    fontFamily: "inherit",
  },
  ".cm-line": {
    padding: "0",
    lineHeight: COMPACT_LINE_HEIGHT,
  },
  ".cm-scroller": {
    overflow: "hidden",
    maxHeight: COMPACT_LINE_HEIGHT,
    lineHeight: COMPACT_LINE_HEIGHT,
    fontFamily: "inherit",
  },
  ".cm-cursor, .cm-dropCursor, .cm-cursorLayer, .cm-cursor-secondary": {
    display: "none !important",
  },
  "&.cm-focused .cm-cursor": {
    display: "block !important",
    borderLeftWidth: "1.5px",
    borderLeftColor: "var(--foreground)",
  },
  "&.cm-focused .cm-selectionBackground, & .cm-selectionBackground": {
    backgroundColor: "transparent !important",
  },
});

function densityExtensions(density: "default" | "compact", placeholderText: string): Extension[] {
  if (density === "compact") {
    // Overlay placeholder in React — CM placeholder widget draws a phantom cursor at line end.
    return [composerCompactTheme];
  }
  return [composerTheme, EditorView.lineWrapping, cmPlaceholder(placeholderText)];
}

function selectionExtensions(density: "default" | "compact"): Extension[] {
  if (density === "compact") {
    // Native caret only — avoids duplicate / dashed drawSelection cursors in single-line capsule.
    return [];
  }
  return [drawSelection({ drawRangeCursor: false })];
}

export interface InlineComposerEditorHandle {
  focus: () => void;
  getParts: () => ComposerPart[];
  insertFileMention: (file: ProjectFile) => void;
  /** Insert a context token from RightArea (terminal, editor, git diff, …). */
  insertContextPart: (part: Exclude<ComposerPart, { type: "text" }>) => boolean;
  /** @deprecated Use insertContextPart */
  insertTerminalSnippet: (part: ComposerPart) => void;
}

export interface InlineComposerEditorProps {
  parts: ComposerPart[];
  onChange: (parts: ComposerPart[]) => void;
  placeholder?: string;
  disabled?: boolean;
  profiles: AgentProfileInfo[];
  files: ProjectFile[];
  searchCommands: (query: string) => CommandDef[];
  slashSkills: SlashCatalogSkill[];
  slashMcps: SlashCatalogMcp[];
  onEnter?: () => void;
  /** Compact single-line styling for AiBar capsule. */
  density?: "default" | "compact";
  /** AiBar compact → expanded when a line is full or content wraps. */
  onLayoutExpand?: () => void;
}

function insertFromDropdown(
  view: EditorView,
  q: ComposerQuery,
  mentionOptions: ReturnType<typeof buildMentionOptions>,
  slashOptions: SlashOption[],
  index: number,
): void {
  if (q.kind === "mention") {
    const opt = mentionOptions[index];
    if (!opt) return;
    if (opt.kind === "profile") {
      insertComposerToken(
        view,
        {
          type: "mention",
          mentionType: "profile",
          id: createTokenId(),
          label: opt.profile.name,
          profileId: opt.profile.id,
        },
        q.from,
        q.to,
      );
    } else if (opt.kind === "paper") {
      const citeLabel = formatPaperMentionLabel(opt.paper.bibkey);
      insertComposerToken(
        view,
        {
          type: "mention",
          mentionType: "paper",
          id: createTokenId(),
          label: citeLabel,
          bibkey: opt.paper.bibkey,
          paperId: opt.paper.id,
        },
        q.from,
        q.to,
      );
    } else {
      insertComposerToken(
        view,
        {
          type: "mention",
          mentionType: "file",
          id: createTokenId(),
          label: opt.file.relativePath,
          filePath: opt.file.relativePath,
          fileId: opt.file.id,
        },
        q.from,
        q.to,
      );
    }
    return;
  }

  const option = slashOptions[index];
  if (!option) return;

  if (option.kind === "command") {
    const cmd = option.command;
    insertComposerToken(
      view,
      {
        type: "command",
        id: createTokenId(),
        label: cmd.name,
        commandName: cmd.name,
        action: cmd.action,
        source: cmd.source,
      },
      q.from,
      q.to,
    );
    return;
  }

  if (option.kind === "skill") {
    insertComposerToken(
      view,
      {
        type: "skill",
        id: createTokenId(),
        label: option.skill.name,
        skillId: option.skill.id,
      },
      q.from,
      q.to,
    );
    return;
  }

  insertComposerToken(
    view,
    {
      type: "mcp",
      id: createTokenId(),
      label: option.mcp.name,
      serverName: option.mcp.name,
    },
    q.from,
    q.to,
  );
}

function buildMentionOptions(
  query: string,
  profiles: AgentProfileInfo[],
  files: ProjectFile[],
  papers: LiteraturePaper[] = [],
) {
  const q = query.toLowerCase();
  const profileOpts = profiles
    .filter(
      (p) =>
        p.enabled &&
        (p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)),
    )
    .slice(0, 6)
    .map((profile) => ({ kind: "profile" as const, profile }));
  const paperOpts = papers
    .filter(
      (p) =>
        p.bibkey.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        (p.authors?.toLowerCase().includes(q) ?? false),
    )
    .slice(0, 6)
    .map((paper) => ({ kind: "paper" as const, paper }));
  const fileOpts = files
    .filter((f) => f.relativePath.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
    .slice(0, 6)
    .map((file) => ({ kind: "file" as const, file }));
  return [...profileOpts, ...paperOpts, ...fileOpts];
}

export const InlineComposerEditor = forwardRef<InlineComposerEditorHandle, InlineComposerEditorProps>(
  function InlineComposerEditor(
    {
      parts,
      onChange,
      placeholder = "@ agent or file, / for commands",
      disabled = false,
      profiles,
      files,
      searchCommands,
      slashSkills,
      slashMcps,
      onEnter,
      density = "default",
      onLayoutExpand,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const editableCompartmentRef = useRef(new Compartment());
    const densityCompartmentRef = useRef(new Compartment());
    const selectionCompartmentRef = useRef(new Compartment());
    const densityRef = useRef(density);
    densityRef.current = density;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onEnterRef = useRef(onEnter);
    onEnterRef.current = onEnter;
    const onLayoutExpandRef = useRef(onLayoutExpand);
    onLayoutExpandRef.current = onLayoutExpand;
    const profilesRef = useRef(profiles);
    profilesRef.current = profiles;
    const filesRef = useRef(files);
    filesRef.current = files;
    const searchCommandsRef = useRef(searchCommands);
    searchCommandsRef.current = searchCommands;
    const slashSkillsRef = useRef(slashSkills);
    slashSkillsRef.current = slashSkills;
    const slashMcpsRef = useRef(slashMcps);
    slashMcpsRef.current = slashMcps;
    const literaturePapers = useLiteratureStore((s) => s.papers);
    const literaturePapersRef = useRef(literaturePapers);
    literaturePapersRef.current = literaturePapers;

    // ── Intensive reading state (per active chat tab) ──
    const intensivePaperIds = useChatStore((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      return tab?.intensivePaperIds ?? [];
    });
    const extractStatesByPaper = useLiteratureExtractStore((s) => s.statesByPaper);
    const loadExtractStates = useLiteratureExtractStore((s) => s.loadStatesForPapers);

    // Papers with a ready extract → intensive toggle enabled only for these.
    const readyPaperIds = useMemo(() => {
      const out = new Set<string>();
      for (const paper of literaturePapers) {
        const states = extractStatesByPaper[paper.id];
        if (states && pickBestReadySource(states, "auto")) out.add(paper.id);
      }
      return out;
    }, [literaturePapers, extractStatesByPaper]);

    const handleToggleIntensive = useCallback(
      (paperId: string, on: boolean) => {
        const store = useChatStore.getState();
        if (on) store.addIntensivePaper(store.activeTabId, paperId);
        else store.removeIntensivePaper(store.activeTabId, paperId);
      },
      [],
    );

    /** Mouse hover disabled while using arrow keys — scrollIntoView can fake-enter row 0. */
    const pointerHoverEnabledRef = useRef(false);

    const enableDropdownPointerHover = useCallback(() => {
      pointerHoverEnabledRef.current = true;
    }, []);

    const disableDropdownPointerHover = useCallback(() => {
      pointerHoverEnabledRef.current = false;
    }, []);

    const canHoverDropdownItem = useCallback(() => pointerHoverEnabledRef.current, []);

    const [activeQuery, setActiveQuery] = useState<ComposerQuery | null>(null);
    const [dropdownIndex, setDropdownIndex] = useState(0);
    const [paperOptionsOpenIndex, setPaperOptionsOpenIndex] = useState<number | null>(null);
    const [paperOptionsSubIndex, setPaperOptionsSubIndex] = useState(0);
    const [dropdownAnchor, setDropdownAnchor] = useState<CursorAnchor | null>(null);

    const activeQueryRef = useRef<ComposerQuery | null>(null);
    const dropdownIndexRef = useRef(dropdownIndex);
    dropdownIndexRef.current = dropdownIndex;
    const paperOptionsOpenIndexRef = useRef(paperOptionsOpenIndex);
    paperOptionsOpenIndexRef.current = paperOptionsOpenIndex;
    const paperOptionsSubIndexRef = useRef(paperOptionsSubIndex);
    paperOptionsSubIndexRef.current = paperOptionsSubIndex;

    const syncQuery = useCallback((view: EditorView) => {
      const query = syncComposerQueryState(view, setActiveQuery, setDropdownAnchor);
      activeQueryRef.current = query;
      return query;
    }, []);

    const clearQuery = useCallback(() => {
      activeQueryRef.current = null;
      setActiveQuery(null);
      setDropdownAnchor(null);
      setPaperOptionsOpenIndex(null);
      setPaperOptionsSubIndex(0);
    }, []);

    const maybeExpandCompactLayout = useCallback((view: EditorView) => {
      if (densityRef.current !== "compact") return;
      if (!onLayoutExpandRef.current) return;
      requestAnimationFrame(() => {
        if (densityRef.current !== "compact") return;
        const available = containerRef.current?.clientWidth ?? view.scrollDOM.clientWidth;
        if (compactComposerNeedsExpand(view, available)) {
          onLayoutExpandRef.current?.();
        }
      });
    }, []);

    const handleDropdownHover = useCallback((index: number) => {
      if (!pointerHoverEnabledRef.current) return;
      setDropdownIndex(index);
    }, []);

    const showDropdown = activeQuery !== null;
    const isEmpty = useMemo(() => isComposerEmpty(parts), [parts]);

    const mentionOptions = useMemo(() => {
      if (!activeQuery || activeQuery.kind !== "mention") return [];
      return buildMentionOptions(activeQuery.query, profiles, files, literaturePapers);
    }, [activeQuery, profiles, files, literaturePapers]);

    // Best-effort: load extract states for papers shown in the mention menu so
    // the 精读 toggle reflects readiness.
    useEffect(() => {
      if (!showDropdown || activeQuery?.kind !== "mention") return;
      const projectRoot = useDocumentStore.getState().projectRoot;
      if (!projectRoot) return;
      const paperIds = mentionOptions
        .filter((o) => o.kind === "paper")
        .map((o) => (o.kind === "paper" ? o.paper.id : ""));
      if (paperIds.length === 0) return;
      const missing = paperIds.filter((id) => !extractStatesByPaper[id]);
      if (missing.length === 0) return;
      void loadExtractStates(projectRoot, missing);
    }, [showDropdown, activeQuery, mentionOptions, extractStatesByPaper, loadExtractStates]);

    const slashOptions = useMemo(() => {
      if (!activeQuery || activeQuery.kind !== "slash") return [];
      return buildSlashOptions(
        activeQuery.query,
        searchCommands(activeQuery.query),
        slashSkills,
        slashMcps,
      );
    }, [activeQuery, searchCommands, slashSkills, slashMcps]);

    const dropdownCount =
      activeQuery?.kind === "mention" ? mentionOptions.length : slashOptions.length;

    const clampedDropdownIndex =
      dropdownCount > 0 ? Math.min(dropdownIndex, dropdownCount - 1) : 0;

    useEffect(() => {
      if (dropdownCount > 0 && dropdownIndex >= dropdownCount) {
        setDropdownIndex(dropdownCount - 1);
      }
    }, [dropdownCount, dropdownIndex]);

    useEffect(() => {
      setDropdownIndex(0);
      setPaperOptionsOpenIndex(null);
      setPaperOptionsSubIndex(0);
      disableDropdownPointerHover();
    }, [activeQuery?.kind, activeQuery?.query, disableDropdownPointerHover]);

    useEffect(() => {
      setPaperOptionsOpenIndex(null);
      setPaperOptionsSubIndex(0);
    }, [dropdownIndex]);

    const emitChange = useCallback((view: EditorView) => {
      onChangeRef.current(readPartsFromView(view));
    }, []);

    const closeDropdown = useCallback(() => {
      clearQuery();
    }, [clearQuery]);

    const insertAtQuery = useCallback(
      (part: Exclude<ComposerPart, { type: "text" }>) => {
        const view = viewRef.current;
        const q = activeQueryRef.current;
        if (!view || !q) return;
        insertComposerToken(view, part, q.from, q.to);
        emitChange(view);
        closeDropdown();
        view.focus();
      },
      [closeDropdown, emitChange],
    );

    const insertProfile = useCallback(
      (profile: AgentProfileInfo) => {
        insertAtQuery({
          type: "mention",
          mentionType: "profile",
          id: createTokenId(),
          label: profile.name,
          profileId: profile.id,
        });
      },
      [insertAtQuery],
    );

    const insertFile = useCallback(
      (file: ProjectFile) => {
        const label = mentionFileLabel(file);
        insertAtQuery({
          type: "mention",
          mentionType: "file",
          id: createTokenId(),
          label,
          filePath: label,
          fileId: file.id,
        });
      },
      [insertAtQuery],
    );

    const insertPaper = useCallback(
      (paper: LiteraturePaper) => {
        insertAtQuery({
          type: "mention",
          mentionType: "paper",
          id: createTokenId(),
          label: formatPaperMentionLabel(paper.bibkey),
          bibkey: paper.bibkey,
          paperId: paper.id,
        });
      },
      [insertAtQuery],
    );

    const insertSlashOption = useCallback(
      (option: SlashOption) => {
        if (option.kind === "command") {
          const cmd = option.command;
          insertAtQuery({
            type: "command",
            id: createTokenId(),
            label: cmd.name,
            commandName: cmd.name,
            action: cmd.action,
            source: cmd.source,
          });
          return;
        }
        if (option.kind === "skill") {
          insertAtQuery({
            type: "skill",
            id: createTokenId(),
            label: option.skill.name,
            skillId: option.skill.id,
          });
          return;
        }
        insertAtQuery({
          type: "mcp",
          id: createTokenId(),
          label: option.mcp.name,
          serverName: option.mcp.name,
        });
      },
      [insertAtQuery],
    );

    const resolveSlashOptions = useCallback((query: string) => {
      return buildSlashOptions(
        query,
        searchCommandsRef.current(query),
        slashSkillsRef.current,
        slashMcpsRef.current,
      );
    }, []);

    const selectDropdownItem = useCallback(
      (view: EditorView): boolean => {
        const q = activeQueryRef.current;
        if (!q) return false;
        const mentions =
          q.kind === "mention"
            ? buildMentionOptions(q.query, profilesRef.current, filesRef.current, useLiteratureStore.getState().papers)
            : [];
        const slashOpts = q.kind === "slash" ? resolveSlashOptions(q.query) : [];
        const count = q.kind === "mention" ? mentions.length : slashOpts.length;
        if (count === 0) return false;
        const idx = Math.min(dropdownIndexRef.current, count - 1);
        insertFromDropdown(view, q, mentions, slashOpts, idx);
        emitChange(view);
        clearQuery();
        return true;
      },
      [emitChange, resolveSlashOptions, clearQuery],
    );

    useEffect(() => {
      if (!containerRef.current) return;
      const { doc, tokenMap } = partsToDoc(parts);

      const composerKeymap = keymap.of([
        {
          key: "Enter",
          run: (view) => {
            if (paperOptionsOpenIndexRef.current !== null) {
              return selectDropdownItem(view);
            }
            if (selectDropdownItem(view)) return true;
            onEnterRef.current?.();
            return true;
          },
        },
        {
          key: "Shift-Enter",
          run: (view) => {
            if (densityRef.current === "compact") {
              onLayoutExpandRef.current?.();
            }
            view.dispatch(view.state.replaceSelection("\n"));
            return true;
          },
        },
        {
          key: "Tab",
          run: (view) => selectDropdownItem(view),
        },
        {
          key: "Space",
          run: () => {
            const optsIdx = paperOptionsOpenIndexRef.current;
            if (optsIdx === null || paperOptionsSubIndexRef.current !== 1) return false;
            const q = activeQueryRef.current;
            if (!q || q.kind !== "mention") return false;
            const mentions = buildMentionOptions(
              q.query,
              profilesRef.current,
              filesRef.current,
              useLiteratureStore.getState().papers,
            );
            const opt = mentions[optsIdx];
            if (opt?.kind !== "paper") return false;
            const ready = pickBestReadySource(
              useLiteratureExtractStore.getState().statesByPaper[opt.paper.id],
              "auto",
            );
            if (!ready) return true;
            const tab = useChatStore.getState().tabs.find(
              (t) => t.id === useChatStore.getState().activeTabId,
            );
            const on = tab?.intensivePaperIds?.includes(opt.paper.id) ?? false;
            handleToggleIntensive(opt.paper.id, !on);
            return true;
          },
        },
        {
          key: "ArrowDown",
          run: () => {
            if (paperOptionsOpenIndexRef.current !== null) {
              setPaperOptionsSubIndex((i) => Math.min(i + 1, 1));
              return true;
            }
            const q = activeQueryRef.current;
            if (!q) return false;
            const mentions =
              q.kind === "mention"
                ? buildMentionOptions(q.query, profilesRef.current, filesRef.current, useLiteratureStore.getState().papers)
                : [];
            const slashOpts = q.kind === "slash" ? resolveSlashOptions(q.query) : [];
            const count = q.kind === "mention" ? mentions.length : slashOpts.length;
            if (count === 0) return false;
            disableDropdownPointerHover();
            setDropdownIndex((i) => Math.min(i + 1, count - 1));
            return true;
          },
        },
        {
          key: "ArrowUp",
          run: () => {
            if (paperOptionsOpenIndexRef.current !== null) {
              setPaperOptionsSubIndex((i) => Math.max(i - 1, 0));
              return true;
            }
            if (!activeQueryRef.current) return false;
            disableDropdownPointerHover();
            setDropdownIndex((i) => Math.max(i - 1, 0));
            return true;
          },
        },
        {
          key: "ArrowRight",
          run: () => {
            const q = activeQueryRef.current;
            if (!q || q.kind !== "mention") return false;
            const mentions = buildMentionOptions(
              q.query,
              profilesRef.current,
              filesRef.current,
              useLiteratureStore.getState().papers,
            );
            const count = mentions.length;
            if (count === 0) return false;
            const idx = Math.min(dropdownIndexRef.current, count - 1);
            if (mentions[idx]?.kind !== "paper") return false;
            setPaperOptionsOpenIndex(idx);
            setPaperOptionsSubIndex(0);
            return true;
          },
        },
        {
          key: "ArrowLeft",
          run: () => {
            if (paperOptionsOpenIndexRef.current === null) return false;
            setPaperOptionsOpenIndex(null);
            setPaperOptionsSubIndex(0);
            return true;
          },
        },
        {
          key: "Escape",
          run: () => {
            if (paperOptionsOpenIndexRef.current !== null) {
              setPaperOptionsOpenIndex(null);
              setPaperOptionsSubIndex(0);
              return true;
            }
            if (!activeQueryRef.current) return false;
            clearQuery();
            return true;
          },
        },
        {
          key: "Backspace",
          run: (view) => {
            if (view.composing) return false;
            return atomicTokenBackspace(view) || false;
          },
        },
        {
          key: "Delete",
          run: (view) => {
            if (view.composing) return false;
            return atomicTokenDeleteForward(view) || false;
          },
        },
      ]);

      const view = new EditorView({
        state: EditorState.create({
          doc,
          extensions: [
            tokenMapStateField,
            tokenDecorationsField,
            composerInlineTokenTheme,
            composerTokenTransactionFilter,
            composerTokenAtomicRanges,
            history(),
            selectionCompartmentRef.current.of(selectionExtensions(density)),
            densityCompartmentRef.current.of(densityExtensions(density, placeholder)),
            editableCompartmentRef.current.of(EditorView.editable.of(!disabled)),
            Prec.highest(composerKeymap),
            keymap.of([...defaultKeymap, ...historyKeymap]),
            EditorView.updateListener.of((update) => {
              const v = update.view;

              if (update.focusChanged) {
                if (v.hasFocus) {
                  syncQuery(v);
                } else if (!activeQueryRef.current) {
                  setDropdownAnchor(null);
                }
              }

              if (!update.docChanged && !update.selectionSet && !update.focusChanged) return;

              if (update.docChanged) {
                if (repairComposerDocIfNeeded(v)) {
                  emitChange(v);
                  return;
                }
                const inserted = collectInsertedText(update.changes);
                if (insertedTextTriggersLinkify(inserted)) {
                  linkifyViewIfNeeded(v);
                }
                emitChange(v);
                if (densityRef.current === "compact") {
                  const scroller = v.scrollDOM;
                  if (v.state.doc.lines > 1 || scroller.scrollWidth > scroller.clientWidth + 1) {
                    maybeExpandCompactLayout(v);
                  }
                }
              }

              if (update.docChanged || update.selectionSet || update.focusChanged) {
                syncQuery(v);
              }
            }),
            EditorView.domEventHandlers({
              blur(_event, view) {
                if (linkifyViewIfNeeded(view)) emitChange(view);
                return false;
              },
              paste(event, view) {
                const text = event.clipboardData?.getData("text/plain");
                if (text == null) return false;
                event.preventDefault();
                const parts = parseTextToComposerParts(text);
                const sel = view.state.selection.main;
                insertComposerParts(view, parts, sel.from, sel.to);
                if (densityRef.current === "compact" && text.includes("\n")) {
                  onLayoutExpandRef.current?.();
                }
                return true;
              },
            }),
          ],
        }),
        parent: containerRef.current,
      });

      view.dispatch({ effects: setTokenMapEffect.of(tokenMap) });
      viewRef.current = view;
      useComposerEditorStore.getState().register({
        focus: () => view.focus(),
        getParts: () => readPartsFromView(view),
        insertFileMention: (file: ProjectFile) => {
          const label = mentionFileLabel(file);
          const pos = view.state.selection.main.head;
          insertComposerToken(
            view,
            {
              type: "mention",
              mentionType: "file",
              id: createTokenId(),
              label,
              filePath: label,
              fileId: file.id,
            },
            pos,
            pos,
          );
          emitChange(view);
          view.focus();
        },
        insertContextPart: (part) => {
          if (
            part.type !== "terminal-snippet" &&
            part.type !== "code-snippet" &&
            part.type !== "git-diff-snippet" &&
            part.type !== "paper-snippet"
          ) {
            return false;
          }
          const pos = view.state.selection.main.head;
          insertComposerToken(view, part, pos, pos);
          emitChange(view);
          view.focus();
          return true;
        },
        insertTerminalSnippet: (part) => {
          if (part.type !== "terminal-snippet") return;
          const pos = view.state.selection.main.head;
          insertComposerToken(view, part, pos, pos);
          emitChange(view);
          view.focus();
        },
      });
      useComposerEditorStore.getState().flushPendingInsert();
      return () => {
        useComposerEditorStore.getState().register(null);
        view.destroy();
        viewRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
    }, []);

    const partsKeyRef = useRef<string | null>(null);
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;

      const currentParts = readPartsFromView(view);
      const incomingKey = JSON.stringify(parts);
      const currentKey = JSON.stringify(currentParts);
      if (incomingKey === currentKey) {
        partsKeyRef.current = incomingKey;
        return;
      }

      // Parent props can lag one frame behind the editor (Add to Chat on empty capsule).
      if (isComposerEmpty(parts) && !isComposerEmpty(currentParts)) {
        const tab = useChatStore.getState().tabs.find(
          (t) => t.id === useChatStore.getState().activeTabId,
        );
        const storeKey = JSON.stringify(loadDraftParts(tab?.draft));
        if (storeKey === currentKey) {
          partsKeyRef.current = currentKey;
          return;
        }
      }

      const { doc, tokenMap } = partsToDoc(parts);
      const currentDoc = view.state.doc.toString();
      if (currentDoc !== doc && stripTokenSeparators(currentDoc) !== stripTokenSeparators(doc)) {
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: doc },
          selection: selectionAfterDocReplace(
            currentDoc,
            doc,
            sel.head,
            (sel.assoc ?? 0) as -1 | 0 | 1,
          ),
          effects: setTokenMapEffect.of(tokenMap),
        });
      } else {
        syncTokenMapFromParts(view, parts);
      }
      partsKeyRef.current = incomingKey;
    }, [parts]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: [
          densityCompartmentRef.current.reconfigure(
            densityExtensions(density, placeholder),
          ),
          selectionCompartmentRef.current.reconfigure(selectionExtensions(density)),
        ],
      });
      maybeExpandCompactLayout(view);
    }, [density, placeholder, maybeExpandCompactLayout]);

    useEffect(() => {
      if (density !== "compact" || !onLayoutExpand) return;
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver(() => {
        const view = viewRef.current;
        if (view) maybeExpandCompactLayout(view);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [density, onLayoutExpand, maybeExpandCompactLayout]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: editableCompartmentRef.current.reconfigure(EditorView.editable.of(!disabled)),
      });
    }, [disabled]);

    useImperativeHandle(ref, () => ({
      focus: () => viewRef.current?.focus(),
      getParts: () => (viewRef.current ? readPartsFromView(viewRef.current) : parts),
      insertFileMention: (file: ProjectFile) => {
        const view = viewRef.current;
        if (!view) return;
        const label = mentionFileLabel(file);
        const pos = view.state.selection.main.head;
        insertComposerToken(
          view,
          {
            type: "mention",
            mentionType: "file",
            id: createTokenId(),
            label,
            filePath: label,
            fileId: file.id,
          },
          pos,
          pos,
        );
        emitChange(view);
        view.focus();
      },
      insertContextPart: (part) => {
        const view = viewRef.current;
        if (!view) return false;
        if (
          part.type !== "terminal-snippet" &&
          part.type !== "code-snippet" &&
          part.type !== "git-diff-snippet" &&
          part.type !== "paper-snippet"
        ) {
          return false;
        }
        const pos = view.state.selection.main.head;
        insertComposerToken(view, part, pos, pos);
        emitChange(view);
        view.focus();
        return true;
      },
      insertTerminalSnippet: (part) => {
        const view = viewRef.current;
        if (!view || part.type !== "terminal-snippet") return;
        const pos = view.state.selection.main.head;
        insertComposerToken(view, part, pos, pos);
        emitChange(view);
        view.focus();
      },
    }));

    return (
      <>
        {showDropdown && activeQuery?.kind === "slash" && (
          <SlashCommandDropdown
            open
            options={slashOptions}
            activeIndex={clampedDropdownIndex}
            anchor={dropdownAnchor}
            onSelect={insertSlashOption}
            onHover={handleDropdownHover}
            onListPointerMove={enableDropdownPointerHover}
            canHoverItem={canHoverDropdownItem}
          />
        )}
        {showDropdown && activeQuery?.kind === "mention" && (
          <MentionDropdown
            open
            options={mentionOptions}
            activeIndex={clampedDropdownIndex}
            anchor={dropdownAnchor}
            onSelectProfile={insertProfile}
            onSelectFile={insertFile}
            onSelectPaper={insertPaper}
            onHover={handleDropdownHover}
            onListPointerMove={enableDropdownPointerHover}
            canHoverItem={canHoverDropdownItem}
            intensivePaperIds={intensivePaperIds}
            readyPaperIds={readyPaperIds}
            onToggleIntensive={handleToggleIntensive}
            paperOptionsOpenIndex={paperOptionsOpenIndex}
            onPaperOptionsOpenChange={setPaperOptionsOpenIndex}
            paperOptionsSubIndex={paperOptionsSubIndex}
          />
        )}
        <div
          className={
            density === "compact"
              ? "relative flex h-6 w-full min-w-0 items-center overflow-hidden"
              : "w-full"
          }
        >
          {density === "compact" && isEmpty && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 z-0 flex max-w-full items-center truncate pr-1 text-[length:var(--font-composer)] text-muted-foreground"
            >
              {placeholder}
            </span>
          )}
          <div
            ref={containerRef}
            className={
              density === "compact"
                ? "relative z-[1] h-full w-full min-w-0"
                : "w-full"
            }
          />
        </div>
      </>
    );
  },
);
