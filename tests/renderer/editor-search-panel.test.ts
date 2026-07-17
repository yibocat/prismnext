import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { SearchQuery, search, setSearchQuery } from "@codemirror/search";
import {
  createPrismSearchPanel,
  describeSearchMatches,
  formatMatchCount,
} from "../../src/renderer/lib/editor/search-panel";

describe("describeSearchMatches", () => {
  it("counts matches and reports current index", () => {
    const state = EditorState.create({
      doc: "alpha beta alpha",
      extensions: [search()],
      selection: { anchor: 0, head: 5 },
    });
    const withQuery = state.update({
      effects: setSearchQuery.of(new SearchQuery({ search: "alpha" })),
    }).state;
    expect(describeSearchMatches(withQuery)).toEqual({
      valid: true,
      total: 2,
      current: 1,
    });
  });

  it("returns invalid for bad regexp", () => {
    const state = EditorState.create({
      doc: "abc",
      extensions: [search()],
    });
    const withQuery = state.update({
      effects: setSearchQuery.of(new SearchQuery({ search: "[", regexp: true })),
    }).state;
    expect(describeSearchMatches(withQuery).valid).toBe(false);
  });
});

describe("formatMatchCount", () => {
  it("formats valid / empty / invalid", () => {
    expect(formatMatchCount({ valid: true, total: 12, current: 3 })).toBe("3/12");
    expect(formatMatchCount({ valid: true, total: 0, current: 0 })).toBe("0");
    expect(formatMatchCount({ valid: false, total: 0, current: 0 })).toBe("—");
  });
});

describe("createPrismSearchPanel", () => {
  it("mounts a floating top-right panel with prism chrome", () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: "hello",
        extensions: [search({ createPanel: createPrismSearchPanel })],
      }),
      parent: document.body,
    });
    const panel = createPrismSearchPanel(view);
    expect(panel.top).toBe(true);
    expect(panel.dom.classList.contains("prism-cm-search")).toBe(true);
    expect(panel.dom.classList.contains("prism-cm-search--float")).toBe(true);
    expect(panel.dom.querySelector("input[main-field=true]")).toBeTruthy();
    expect(panel.dom.querySelector(".prism-cm-search__toggles")).toBeTruthy();
    expect(panel.dom.querySelector("[data-prism-search-replace-row]")).toBeTruthy();
    view.destroy();
  });
});
