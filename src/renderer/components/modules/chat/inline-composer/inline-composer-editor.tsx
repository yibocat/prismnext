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
import type { ProjectFile } from "@/stores/document-store";
import type { ComposerPart } from "./tokens";
import { createTokenId } from "./tokens";
import { partsToDoc } from "./serialize";
import {
  atomicTokenDelete,
  insertComposerToken,
  readPartsFromView,
  setTokenMapEffect,
  syncTokenMapFromParts,
  tokenDecorationsField,
  tokenMapStateField,
} from "./token-field";
import { detectQueryAtCursor, type ComposerQuery } from "./query";
import { MentionDropdown, SlashCommandDropdown } from "./composer-dropdown";
import { anchorFromCoords } from "./dropdown-position";
import type { CursorAnchor } from "./dropdown-position";

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
    caretColor: "var(--foreground)",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--foreground)",
  },
  ".inline-composer-token": {
    verticalAlign: "baseline",
  },
});

export interface InlineComposerEditorHandle {
  focus: () => void;
  getParts: () => ComposerPart[];
}

export interface InlineComposerEditorProps {
  parts: ComposerPart[];
  onChange: (parts: ComposerPart[]) => void;
  placeholder?: string;
  disabled?: boolean;
  profiles: AgentProfileInfo[];
  files: ProjectFile[];
  searchCommands: (query: string) => CommandDef[];
  onEnter?: () => void;
}

function insertFromDropdown(
  view: EditorView,
  q: ComposerQuery,
  mentionOptions: ReturnType<typeof buildMentionOptions>,
  slashCommands: CommandDef[],
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

  const cmd = slashCommands[index];
  if (!cmd) return;
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
}

function buildMentionOptions(
  query: string,
  profiles: AgentProfileInfo[],
  files: ProjectFile[],
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
  const fileOpts = files
    .filter((f) => f.relativePath.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
    .slice(0, 6)
    .map((file) => ({ kind: "file" as const, file }));
  return [...profileOpts, ...fileOpts];
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
      onEnter,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const editableCompartmentRef = useRef(new Compartment());
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onEnterRef = useRef(onEnter);
    onEnterRef.current = onEnter;
    const profilesRef = useRef(profiles);
    profilesRef.current = profiles;
    const filesRef = useRef(files);
    filesRef.current = files;
    const searchCommandsRef = useRef(searchCommands);
    searchCommandsRef.current = searchCommands;

    const [activeQuery, setActiveQuery] = useState<ComposerQuery | null>(null);
    const [dropdownIndex, setDropdownIndex] = useState(0);
    const [dropdownAnchor, setDropdownAnchor] = useState<CursorAnchor | null>(null);

    const activeQueryRef = useRef<ComposerQuery | null>(null);
    const dropdownIndexRef = useRef(dropdownIndex);
    dropdownIndexRef.current = dropdownIndex;

    const mentionOptions = useMemo(() => {
      if (!activeQuery || activeQuery.kind !== "mention") return [];
      return buildMentionOptions(activeQuery.query, profiles, files);
    }, [activeQuery, profiles, files]);

    const slashCommands = useMemo(() => {
      if (!activeQuery || activeQuery.kind !== "slash") return [];
      return searchCommands(activeQuery.query);
    }, [activeQuery, searchCommands]);

    const dropdownCount =
      activeQuery?.kind === "mention" ? mentionOptions.length : slashCommands.length;

    useEffect(() => {
      setDropdownIndex(0);
    }, [activeQuery?.kind, activeQuery?.query]);

    const updateDropdownPosition = useCallback((view: EditorView) => {
      const cursor = view.state.selection.main.head;
      const coords = view.coordsAtPos(cursor);
      if (!coords) return;
      setDropdownAnchor(anchorFromCoords(coords));
    }, []);

    const emitChange = useCallback((view: EditorView) => {
      onChangeRef.current(readPartsFromView(view));
    }, []);

    const closeDropdown = useCallback(() => {
      activeQueryRef.current = null;
      setActiveQuery(null);
    }, []);

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
        insertAtQuery({
          type: "mention",
          mentionType: "file",
          id: createTokenId(),
          label: file.relativePath,
          filePath: file.relativePath,
          fileId: file.id,
        });
      },
      [insertAtQuery],
    );

    const insertCommand = useCallback(
      (cmd: CommandDef) => {
        insertAtQuery({
          type: "command",
          id: createTokenId(),
          label: cmd.name,
          commandName: cmd.name,
          action: cmd.action,
          source: cmd.source,
        });
      },
      [insertAtQuery],
    );

    const selectDropdownItem = useCallback(
      (view: EditorView): boolean => {
        const q = activeQueryRef.current;
        if (!q) return false;
        const idx = dropdownIndexRef.current;
        const mentions =
          q.kind === "mention"
            ? buildMentionOptions(q.query, profilesRef.current, filesRef.current)
            : [];
        const commands = q.kind === "slash" ? searchCommandsRef.current(q.query) : [];
        const count = q.kind === "mention" ? mentions.length : commands.length;
        if (count === 0) return false;
        insertFromDropdown(view, q, mentions, commands, idx);
        emitChange(view);
        activeQueryRef.current = null;
        setActiveQuery(null);
        return true;
      },
      [emitChange],
    );

    useEffect(() => {
      if (!containerRef.current) return;
      const { doc, tokenMap } = partsToDoc(parts);

      const composerKeymap = keymap.of([
        {
          key: "Enter",
          run: (view) => {
            if (selectDropdownItem(view)) return true;
            onEnterRef.current?.();
            return true;
          },
        },
        {
          key: "Shift-Enter",
          run: (view) => {
            view.dispatch(view.state.replaceSelection("\n"));
            return true;
          },
        },
        {
          key: "Tab",
          run: (view) => selectDropdownItem(view),
        },
        {
          key: "ArrowDown",
          run: () => {
            const q = activeQueryRef.current;
            if (!q) return false;
            const mentions =
              q.kind === "mention"
                ? buildMentionOptions(q.query, profilesRef.current, filesRef.current)
                : [];
            const commands = q.kind === "slash" ? searchCommandsRef.current(q.query) : [];
            const count = q.kind === "mention" ? mentions.length : commands.length;
            if (count === 0) return false;
            setDropdownIndex((i) => Math.min(i + 1, count - 1));
            return true;
          },
        },
        {
          key: "ArrowUp",
          run: () => {
            if (!activeQueryRef.current) return false;
            setDropdownIndex((i) => Math.max(i - 1, 0));
            return true;
          },
        },
        {
          key: "Escape",
          run: () => {
            if (!activeQueryRef.current) return false;
            activeQueryRef.current = null;
            setActiveQuery(null);
            return true;
          },
        },
        {
          key: "Backspace",
          run: (view) => atomicTokenDelete(view),
        },
        {
          key: "Delete",
          run: (view) => atomicTokenDelete(view),
        },
      ]);

      const view = new EditorView({
        state: EditorState.create({
          doc,
          extensions: [
            tokenMapStateField,
            tokenDecorationsField,
            history(),
            drawSelection(),
            EditorView.lineWrapping,
            composerTheme,
            cmPlaceholder(placeholder),
            editableCompartmentRef.current.of(EditorView.editable.of(!disabled)),
            Prec.highest(composerKeymap),
            keymap.of([...defaultKeymap, ...historyKeymap]),
            EditorView.updateListener.of((update) => {
              if (!update.docChanged && !update.selectionSet) return;
              const v = update.view;
              if (update.docChanged) emitChange(v);
              const cursor = v.state.selection.main.head;
              const query = detectQueryAtCursor(v.state.doc.toString(), cursor);
              activeQueryRef.current = query;
              setActiveQuery(query);
              if (query) updateDropdownPosition(v);
              else setDropdownAnchor(null);
            }),
            EditorView.domEventHandlers({
              paste(event, view) {
                const text = event.clipboardData?.getData("text/plain");
                if (text == null) return false;
                event.preventDefault();
                view.dispatch(view.state.replaceSelection(text));
                return true;
              },
            }),
          ],
        }),
        parent: containerRef.current,
      });

      view.dispatch({ effects: setTokenMapEffect.of(tokenMap) });
      viewRef.current = view;
      return () => {
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

      const { doc, tokenMap } = partsToDoc(parts);
      const currentDoc = view.state.doc.toString();
      if (currentDoc !== doc) {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: doc },
          selection: EditorSelection.cursor(doc.length),
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
        effects: editableCompartmentRef.current.reconfigure(EditorView.editable.of(!disabled)),
      });
    }, [disabled]);

    useImperativeHandle(ref, () => ({
      focus: () => viewRef.current?.focus(),
      getParts: () => (viewRef.current ? readPartsFromView(viewRef.current) : parts),
    }));

    return (
      <>
        {activeQuery?.kind === "slash" && (
          <SlashCommandDropdown
            open
            commands={slashCommands}
            activeIndex={dropdownIndex}
            anchor={dropdownAnchor}
            onSelect={insertCommand}
            onHover={setDropdownIndex}
          />
        )}
        {activeQuery?.kind === "mention" && (
          <MentionDropdown
            open
            options={mentionOptions}
            activeIndex={dropdownIndex}
            anchor={dropdownAnchor}
            onSelectProfile={insertProfile}
            onSelectFile={insertFile}
            onHover={setDropdownIndex}
          />
        )}
        <div ref={containerRef} className="w-full" />
      </>
    );
  },
);
