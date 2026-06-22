import { StateField, StateEffect, RangeSetBuilder, EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ComposerPart } from "./tokens";
import { TOKEN_MARKER_END, TOKEN_MARKER_START } from "./serialize";
import { TokenChip } from "./token-widgets";

export const setTokenMapEffect = StateEffect.define<Map<string, ComposerPart>>();

export const tokenMapStateField = StateField.define<Map<string, ComposerPart>>({
  create() {
    return new Map();
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setTokenMapEffect)) return effect.value;
    }
    return value;
  },
});

class TokenWidget extends WidgetType {
  constructor(private readonly part: Exclude<ComposerPart, { type: "text" }>) {
    super();
  }

  eq(other: TokenWidget): boolean {
    return other.part.id === this.part.id;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "inline-composer-token";
    wrap.setAttribute("contenteditable", "false");
    const root: Root = createRoot(wrap);
    root.render(createElement(TokenChip, { part: this.part }));
    (wrap as HTMLElement & { __cmRoot?: Root }).__cmRoot = root;
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }

  destroy(dom: HTMLElement): void {
    const root = (dom as HTMLElement & { __cmRoot?: Root }).__cmRoot;
    queueMicrotask(() => root?.unmount());
  }
}

function buildTokenDecorations(state: EditorState, tokenMap: Map<string, ComposerPart>) {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc.toString();
  let i = 0;
  while (i < doc.length) {
    const start = doc.indexOf(TOKEN_MARKER_START, i);
    if (start === -1) break;
    const end = doc.indexOf(TOKEN_MARKER_END, start + 1);
    if (end === -1) break;
    const tokenId = doc.slice(start + TOKEN_MARKER_START.length, end);
    const part = tokenMap.get(tokenId);
    if (part && part.type !== "text") {
      builder.add(
        start,
        end + TOKEN_MARKER_END.length,
        Decoration.replace({
          widget: new TokenWidget(part),
          inclusive: false,
        }),
      );
    }
    i = end + TOKEN_MARKER_END.length;
  }
  return builder.finish();
}

export const tokenDecorationsField = StateField.define<ReturnType<typeof buildTokenDecorations>>({
  create(state) {
    const tokenMap = state.field(tokenMapStateField);
    return buildTokenDecorations(state, tokenMap);
  },
  update(deco, tr) {
    const tokenMap = tr.state.field(tokenMapStateField);
    if (tr.docChanged || tr.effects.some((e) => e.is(setTokenMapEffect))) {
      return buildTokenDecorations(tr.state, tokenMap);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function findTokenRange(doc: string, index: number): { from: number; to: number } | null {
  let search = index;
  while (search >= 0) {
    const start = doc.lastIndexOf(TOKEN_MARKER_START, search);
    if (start === -1) return null;
    const end = doc.indexOf(TOKEN_MARKER_END, start + 1);
    if (end === -1) return null;
    const to = end + TOKEN_MARKER_END.length;
    if (index >= start && index <= to) return { from: start, to };
    search = start - 1;
  }
  return null;
}

/** Delete whole token when backspace/delete hits marker boundary. */
export function atomicTokenDelete(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const pos = sel.head;
  const doc = state.doc.toString();

  if (pos > 0) {
    const token = findTokenRange(doc, pos - 1);
    if (token && token.to === pos) {
      view.dispatch({ changes: { from: token.from, to: token.to } });
      return true;
    }
  }
  const token = findTokenRange(doc, pos);
  if (token && token.from === pos) {
    view.dispatch({ changes: { from: token.from, to: token.to } });
    return true;
  }
  return false;
}

export function insertComposerToken(
  view: EditorView,
  part: Exclude<ComposerPart, { type: "text" }>,
  replaceFrom: number,
  replaceTo: number,
): void {
  const tokenMap = new Map(view.state.field(tokenMapStateField));
  tokenMap.set(part.id, part);
  const marker = `${TOKEN_MARKER_START}${part.id}${TOKEN_MARKER_END}`;
  const insert = `${marker} `;
  const cursor = replaceFrom + insert.length;

  view.dispatch({
    changes: { from: replaceFrom, to: replaceTo, insert },
    selection: { anchor: cursor },
    effects: setTokenMapEffect.of(tokenMap),
  });
}

export function syncTokenMapFromParts(view: EditorView, parts: ComposerPart[]): void {
  const tokenMap = new Map<string, ComposerPart>();
  for (const part of parts) {
    if (part.type !== "text") tokenMap.set(part.id, part);
  }
  const current = view.state.field(tokenMapStateField);
  if (mapsEqual(current, tokenMap)) return;
  view.dispatch({ effects: setTokenMapEffect.of(tokenMap) });
}

function mapsEqual(a: Map<string, ComposerPart>, b: Map<string, ComposerPart>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a.keys()) {
    if (!b.has(k)) return false;
  }
  return true;
}

export function readPartsFromView(view: EditorView): ComposerPart[] {
  const doc = view.state.doc.toString();
  const tokenMap = view.state.field(tokenMapStateField);
  return docToPartsInline(doc, tokenMap);
}

function docToPartsInline(doc: string, tokenMap: Map<string, ComposerPart>): ComposerPart[] {
  const parts: ComposerPart[] = [];
  let lastIndex = 0;
  const re = /\uE000([^\uE001]+)\uE001/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(doc)) !== null) {
    const before = doc.slice(lastIndex, match.index);
    if (before) parts.push({ type: "text", text: before });
    const tokenId = match[1];
    const token = tokenMap.get(tokenId);
    if (token) parts.push(token);
    else parts.push({ type: "text", text: match[0] });
    lastIndex = match.index + match[0].length;
  }
  const tail = doc.slice(lastIndex);
  if (tail) parts.push({ type: "text", text: tail });
  return mergeAdjacent(parts);
}

function mergeAdjacent(parts: ComposerPart[]): ComposerPart[] {
  const merged: ComposerPart[] = [];
  for (const part of parts) {
    if (part.type === "text" && merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (prev.type === "text") {
        prev.text += part.text;
        continue;
      }
    }
    if (part.type === "text" && !part.text) continue;
    merged.push(part.type === "text" ? { ...part } : { ...part });
  }
  return merged;
}
