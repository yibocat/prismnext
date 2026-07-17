import type { EditorState } from "@codemirror/state";
import {
  EditorView,
  runScopeHandlers,
  type Panel,
  type ViewUpdate,
} from "@codemirror/view";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from "@codemirror/search";
import { i18n } from "@/lib/i18n";

const FP = "editor.findPanel" as const;

export type SearchMatchSummary = {
  valid: boolean;
  total: number;
  /** 1-based index of the match under / nearest the selection; 0 when none. */
  current: number;
};

const MATCH_SCAN_CAP = 10_000;

/** Summarize matches for the current search query + selection. */
export function describeSearchMatches(state: EditorState): SearchMatchSummary {
  const query = getSearchQuery(state);
  if (!query.search) {
    return { valid: true, total: 0, current: 0 };
  }
  if (!query.valid) {
    return { valid: false, total: 0, current: 0 };
  }

  const matches: { from: number; to: number }[] = [];
  const cursor = query.getCursor(state);
  for (let step = cursor.next(); !step.done; step = cursor.next()) {
    matches.push(step.value);
    if (matches.length >= MATCH_SCAN_CAP) break;
  }

  if (matches.length === 0) {
    return { valid: true, total: 0, current: 0 };
  }

  const sel = state.selection.main;
  let idx = matches.findIndex((m) => m.from === sel.from && m.to === sel.to);
  if (idx < 0) {
    idx = matches.findIndex((m) => m.from <= sel.head && m.to >= sel.head);
  }
  if (idx < 0) {
    idx = matches.findIndex((m) => m.from >= sel.head);
  }
  if (idx < 0) idx = 0;

  return { valid: true, total: matches.length, current: idx + 1 };
}

export function formatMatchCount(summary: SearchMatchSummary): string {
  if (!summary.valid) return "—";
  if (summary.total === 0) return "0";
  return `${summary.current}/${summary.total}`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function svgIcon(pathD: string): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", pathD);
  svg.append(path);
  return svg;
}

const ICONS = {
  chevronRight: "m9 18 6-6-6-6",
  chevronDown: "m6 9 6 6 6-6",
  prev: "m18 15-6-6-6 6",
  next: "m6 9 6 6 6-6",
  close: "M18 6 6 18M6 6l12 12",
} as const;

function iconBtn(
  name: string,
  title: string,
  content: string | SVGSVGElement,
  onClick: () => void,
  opts?: { pressed?: boolean; className?: string },
): HTMLButtonElement {
  const btn = el("button", {
    type: "button",
    name,
    title,
    "aria-label": title,
    class: `prism-cm-search__btn${opts?.className ? ` ${opts.className}` : ""}`,
  }) as HTMLButtonElement;
  if (typeof content === "string") btn.textContent = content;
  else btn.append(content);
  if (opts?.pressed) {
    btn.setAttribute("aria-pressed", "true");
    btn.classList.add("is-active");
  } else if (opts?.pressed === false) {
    btn.setAttribute("aria-pressed", "false");
  }
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    onClick();
  });
  return btn;
}

/**
 * Prism find/replace widget (VS Code–style float, top-right).
 * Find by default; expand for replace.
 */
export function createPrismSearchPanel(view: EditorView): Panel {
  return new PrismSearchPanel(view);
}

class PrismSearchPanel implements Panel {
  readonly top = true;
  readonly dom: HTMLElement;
  private query: SearchQuery;
  private readonly searchField: HTMLInputElement;
  private readonly replaceField: HTMLInputElement;
  private readonly countEl: HTMLElement;
  private readonly replaceRow: HTMLElement;
  private readonly expandBtn: HTMLButtonElement;
  private readonly caseBtn: HTMLButtonElement;
  private readonly wordBtn: HTMLButtonElement;
  private readonly reBtn: HTMLButtonElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly replaceBtn: HTMLButtonElement;
  private readonly replaceAllBtn: HTMLButtonElement;
  private replaceOpen = false;
  private readonly onLanguageChanged = () => this.applyLabels();

  constructor(private readonly view: EditorView) {
    this.query = getSearchQuery(view.state);
    this.searchField = el("input", {
      type: "text",
      name: "search",
      class: "prism-cm-search__input",
      "main-field": "true",
      autocomplete: "off",
      spellcheck: "false",
      value: this.query.search,
    }) as HTMLInputElement;

    this.replaceField = el("input", {
      type: "text",
      name: "replace",
      class: "prism-cm-search__input",
      autocomplete: "off",
      spellcheck: "false",
      value: this.query.replace,
    }) as HTMLInputElement;

    this.countEl = el("span", {
      class: "prism-cm-search__count",
      "aria-live": "polite",
    }, ["0"]);

    this.caseBtn = iconBtn("case", "", "Aa", () => this.toggleFlag("caseSensitive"), {
      pressed: this.query.caseSensitive,
    });
    this.wordBtn = iconBtn("word", "", "ab", () => this.toggleFlag("wholeWord"), {
      pressed: this.query.wholeWord,
      className: "prism-cm-search__btn--word",
    });
    this.reBtn = iconBtn("re", "", ".*", () => this.toggleFlag("regexp"), {
      pressed: this.query.regexp,
      className: "prism-cm-search__btn--re",
    });

    this.expandBtn = iconBtn(
      "expand",
      "",
      svgIcon(ICONS.chevronRight),
      () => this.setReplaceOpen(!this.replaceOpen),
      { className: "prism-cm-search__btn--expand" },
    );
    this.expandBtn.setAttribute("aria-expanded", "false");

    this.prevBtn = iconBtn("prev", "", svgIcon(ICONS.prev), () => findPrevious(this.view));
    this.nextBtn = iconBtn("next", "", svgIcon(ICONS.next), () => findNext(this.view));
    this.closeBtn = iconBtn("close", "", svgIcon(ICONS.close), () => closeSearchPanel(this.view), {
      className: "prism-cm-search__btn--close",
    });
    this.replaceBtn = iconBtn("replace", "", "Replace", () => replaceNext(this.view), {
      className: "prism-cm-search__text-btn",
    });
    this.replaceAllBtn = iconBtn("replaceAll", "", "All", () => replaceAll(this.view), {
      className: "prism-cm-search__text-btn",
    });

    // VS Code–style: toggles live inside the find field.
    const findField = el("div", { class: "prism-cm-search__field" }, [
      this.searchField,
      el("div", { class: "prism-cm-search__toggles" }, [
        this.caseBtn,
        this.wordBtn,
        this.reBtn,
      ]),
    ]);

    const findMeta = el("div", { class: "prism-cm-search__meta" }, [
      this.countEl,
      this.prevBtn,
      this.nextBtn,
      this.closeBtn,
    ]);

    const findRow = el("div", { class: "prism-cm-search__row" }, [
      this.expandBtn,
      findField,
      findMeta,
    ]);

    const replaceMeta = el("div", { class: "prism-cm-search__meta" }, [
      this.replaceBtn,
      this.replaceAllBtn,
    ]);

    this.replaceRow = el("div", {
      class: "prism-cm-search__row prism-cm-search__row--replace",
      "data-prism-search-replace-row": "true",
    }, [
      el("span", { class: "prism-cm-search__gutter", "aria-hidden": "true" }),
      el("div", { class: "prism-cm-search__field prism-cm-search__field--replace" }, [
        this.replaceField,
      ]),
      replaceMeta,
    ]);

    if (view.state.readOnly) {
      this.expandBtn.hidden = true;
      this.replaceRow.querySelectorAll(":scope > *").forEach((node) => {
        if (node instanceof HTMLElement) node.hidden = true;
      });
    }

    this.dom = el("div", {
      class: "prism-cm-search prism-cm-search--float",
      role: "search",
    }, [
      findRow,
      this.replaceRow,
    ]);

    this.dom.addEventListener("keydown", (e) => this.onKeyDown(e));
    this.searchField.addEventListener("input", () => this.commit());
    this.replaceField.addEventListener("input", () => this.commit());
    i18n.on("languageChanged", this.onLanguageChanged);

    this.applyLabels();
    this.refreshCount();
    this.syncInvalidState();
  }

  mount() {
    this.searchField.select();
  }

  destroy() {
    i18n.off("languageChanged", this.onLanguageChanged);
  }

  update(update: ViewUpdate) {
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (effect.is(setSearchQuery) && !effect.value.eq(this.query)) {
          this.applyQueryToFields(effect.value);
        }
      }
    }
    if (
      update.docChanged
      || update.selectionSet
      || update.transactions.some((tr) => tr.effects.some((e) => e.is(setSearchQuery)))
    ) {
      this.refreshCount();
      this.syncInvalidState();
    }
  }

  private setReplaceOpen(open: boolean) {
    if (this.view.state.readOnly) return;
    this.replaceOpen = open;
    this.expandBtn.setAttribute("aria-expanded", open ? "true" : "false");
    this.expandBtn.replaceChildren(svgIcon(open ? ICONS.chevronDown : ICONS.chevronRight));
    this.dom.classList.toggle("prism-cm-search--replace-open", open);
    if (open) this.replaceField.focus();
    else this.searchField.focus();
  }

  private applyLabels() {
    const t = (key: string) => i18n.t(`${FP}.${key}`);
    this.searchField.placeholder = t("find");
    this.searchField.setAttribute("aria-label", t("find"));
    this.replaceField.placeholder = t("replace");
    this.replaceField.setAttribute("aria-label", t("replace"));
    this.setBtnLabel(this.expandBtn, t("toggleReplace"));
    this.setBtnLabel(this.caseBtn, t("matchCase"));
    this.setBtnLabel(this.wordBtn, t("wholeWord"));
    this.setBtnLabel(this.reBtn, t("regexp"));
    this.setBtnLabel(this.prevBtn, t("previous"));
    this.setBtnLabel(this.nextBtn, t("next"));
    this.setBtnLabel(this.closeBtn, t("close"));
    this.replaceBtn.textContent = t("replace");
    this.setBtnLabel(this.replaceBtn, t("replace"));
    this.replaceAllBtn.textContent = t("replaceAll");
    this.setBtnLabel(this.replaceAllBtn, t("replaceAll"));
  }

  private setBtnLabel(btn: HTMLButtonElement, label: string) {
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }

  private toggleFlag(flag: "caseSensitive" | "wholeWord" | "regexp") {
    const next = {
      search: this.searchField.value,
      replace: this.replaceField.value,
      caseSensitive: this.query.caseSensitive,
      wholeWord: this.query.wholeWord,
      regexp: this.query.regexp,
      [flag]: !this.query[flag],
    };
    this.dispatchQuery(new SearchQuery(next));
    this.syncToggleButtons();
  }

  private commit() {
    this.dispatchQuery(
      new SearchQuery({
        search: this.searchField.value,
        replace: this.replaceField.value,
        caseSensitive: this.query.caseSensitive,
        wholeWord: this.query.wholeWord,
        regexp: this.query.regexp,
      }),
    );
  }

  private dispatchQuery(query: SearchQuery) {
    if (query.eq(this.query)) {
      this.refreshCount();
      this.syncInvalidState();
      return;
    }
    this.query = query;
    this.view.dispatch({ effects: setSearchQuery.of(query) });
    this.syncToggleButtons();
    this.refreshCount();
    this.syncInvalidState();
  }

  private applyQueryToFields(query: SearchQuery) {
    this.query = query;
    this.searchField.value = query.search;
    this.replaceField.value = query.replace;
    this.syncToggleButtons();
  }

  private syncToggleButtons() {
    this.setPressed(this.caseBtn, this.query.caseSensitive);
    this.setPressed(this.wordBtn, this.query.wholeWord);
    this.setPressed(this.reBtn, this.query.regexp);
  }

  private setPressed(btn: HTMLButtonElement, on: boolean) {
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("is-active", on);
  }

  private refreshCount() {
    this.countEl.textContent = formatMatchCount(describeSearchMatches(this.view.state));
  }

  private syncInvalidState() {
    const invalid = !getSearchQuery(this.view.state).valid && Boolean(this.searchField.value);
    this.searchField.classList.toggle("is-invalid", invalid);
    this.dom.classList.toggle("prism-cm-search--invalid", invalid);
  }

  private onKeyDown(e: KeyboardEvent) {
    if (runScopeHandlers(this.view, e, "search-panel")) {
      e.preventDefault();
      return;
    }

    // Fallback if scope keymap did not run (should be rare after scope wiring).
    if (e.key === "Escape") {
      e.preventDefault();
      closeSearchPanel(this.view);
      return;
    }

    if (e.key === "Enter" && e.target === this.searchField) {
      e.preventDefault();
      (e.shiftKey ? findPrevious : findNext)(this.view);
      return;
    }

    if (e.key === "Enter" && e.target === this.replaceField) {
      e.preventDefault();
      replaceNext(this.view);
      return;
    }

    // ⌘⌥F / Ctrl+Alt+F — expand replace (common editor habit)
    if (e.key.toLowerCase() === "f" && (e.metaKey || e.ctrlKey) && e.altKey) {
      e.preventDefault();
      this.setReplaceOpen(true);
    }
  }
}

/** Theme tweaks for search match highlights to sit with Prism chrome. */
export const prismSearchTheme = EditorView.theme({
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in oklch, var(--warning) 35%, transparent)",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "color-mix(in oklch, var(--primary) 40%, transparent)",
  },
});
