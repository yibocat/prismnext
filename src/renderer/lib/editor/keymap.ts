import { EditorSelection, type Extension } from "@codemirror/state";
import { keymap, type Command, type KeyBinding } from "@codemirror/view";
import { toggleComment } from "@codemirror/commands";
import {
  closeSearchPanel,
  highlightSelectionMatches,
  openSearchPanel,
  search,
} from "@codemirror/search";
import {
  chordToCodeMirrorKey,
  resolveChord,
  type ShortcutOverrides,
} from "../../../shared/shortcuts";
import { createPrismSearchPanel, prismSearchTheme } from "./search-panel";

/** True when the event target is inside a CodeMirror editor host. */
export function eventTargetInCodeMirror(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(".cm-editor"));
}

/** Wrap the current selection(s) with `\\command{…}` (cursor ends inside braces). */
export function wrapWithLatexCommand(command: string): Command {
  const open = `\\${command}{`;
  const close = "}";
  return (view) => {
    const changes = view.state.changeByRange((range) => {
      const selected = view.state.sliceDoc(range.from, range.to);
      const insert = open + selected + close;
      const cursor = range.from + open.length + selected.length;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(cursor),
      };
    });
    view.dispatch(changes);
    return true;
  };
}

export type EditorKeymapOptions = {
  /** Include LaTeX wrap bindings (bold / italic). */
  latexWrap?: boolean;
  overrides?: ShortcutOverrides;
};

function bindingFor(
  id: string,
  run: Command,
  overrides?: ShortcutOverrides,
  extra?: Partial<KeyBinding>,
): KeyBinding | null {
  const resolved = resolveChord(id, overrides);
  if (!resolved) return null;
  return {
    key: chordToCodeMirrorKey(resolved.chord),
    preventDefault: true,
    run,
    ...extra,
  };
}

/**
 * Registry-driven editor key bindings (find / wrap / comment / Esc).
 * Callers still own save / merge accept-reject bindings.
 */
export function buildEditorKeyBindings(options: EditorKeymapOptions = {}): KeyBinding[] {
  const { latexWrap = false, overrides } = options;
  const bindings: KeyBinding[] = [];

  // Same scopes as @codemirror/search searchKeymap — required so Esc works
  // while focus is inside the find/replace panel inputs.
  const find = bindingFor("editor.find", openSearchPanel, overrides, {
    scope: "editor search-panel",
  });
  if (find) bindings.push(find);

  const close = bindingFor("editor.closeSearch", closeSearchPanel, overrides, {
    scope: "editor search-panel",
  });
  if (close) bindings.push(close);

  const comment = bindingFor("editor.comment", toggleComment, overrides);
  if (comment) bindings.push(comment);

  if (latexWrap) {
    const bold = bindingFor("editor.bold", wrapWithLatexCommand("textbf"), overrides);
    if (bold) bindings.push(bold);
    const italic = bindingFor("editor.italic", wrapWithLatexCommand("textit"), overrides);
    if (italic) bindings.push(italic);
  }

  return bindings;
}

/** Search panel + highlight + registry keymap for a file editor. */
export function editorSearchAndKeymap(options: EditorKeymapOptions = {}): Extension[] {
  return [
    search({ top: true, createPanel: createPrismSearchPanel }),
    prismSearchTheme,
    highlightSelectionMatches(),
    keymap.of(buildEditorKeyBindings(options)),
  ];
}
