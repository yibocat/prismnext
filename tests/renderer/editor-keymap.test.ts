import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  buildEditorKeyBindings,
  eventTargetInCodeMirror,
  wrapWithLatexCommand,
} from "../../src/renderer/lib/editor/keymap";

describe("wrapWithLatexCommand", () => {
  it("wraps selection in \\textbf{}", () => {
    const state = EditorState.create({ doc: "hello world" });
    const view = new EditorView({
      state: state.update({
        selection: { anchor: 0, head: 5 },
      }).state,
    });
    expect(wrapWithLatexCommand("textbf")(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("\\textbf{hello} world");
    view.destroy();
  });

  it("inserts empty command and places cursor inside braces", () => {
    const view = new EditorView({
      state: EditorState.create({ doc: "ab", selection: { anchor: 1, head: 1 } }),
    });
    expect(wrapWithLatexCommand("textit")(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("a\\textit{}b");
    expect(view.state.selection.main.head).toBe("a\\textit{".length);
    view.destroy();
  });
});

describe("eventTargetInCodeMirror", () => {
  it("detects .cm-editor ancestors", () => {
    const root = document.createElement("div");
    root.className = "cm-editor";
    const child = document.createElement("span");
    root.appendChild(child);
    document.body.appendChild(root);
    expect(eventTargetInCodeMirror(child)).toBe(true);
    expect(eventTargetInCodeMirror(document.body)).toBe(false);
    root.remove();
  });
});

describe("buildEditorKeyBindings", () => {
  it("binds registry chords for latex editors", () => {
    const keys = buildEditorKeyBindings({
      latexWrap: true,
    }).map((b) => b.key);
    expect(keys).toContain("Mod-f");
    expect(keys).toContain("Mod-b");
    expect(keys).toContain("Mod-i");
    expect(keys).toContain("Mod-/");
    expect(keys).toContain("Escape");
  });

  it("scopes find/close for search-panel focus", () => {
    const bindings = buildEditorKeyBindings({ latexWrap: false });
    const find = bindings.find((b) => b.key === "Mod-f");
    const close = bindings.find((b) => b.key === "Escape");
    expect(find?.scope).toBe("editor search-panel");
    expect(close?.scope).toBe("editor search-panel");
  });

  it("omits latex wrap when not requested", () => {
    const keys = buildEditorKeyBindings({ latexWrap: false }).map((b) => b.key);
    expect(keys).toContain("Mod-f");
    expect(keys).not.toContain("Mod-b");
  });
});
