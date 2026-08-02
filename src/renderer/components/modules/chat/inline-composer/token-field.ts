import { StateField, StateEffect, RangeSetBuilder, EditorState, EditorSelection } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { invertedEffects } from "@codemirror/commands";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ComposerPart } from "@/lib/chat/composer-parts";
import { expandLinkTokensInParts, mergeAdjacentText } from "@/lib/chat/composer-parts";
import {
  TOKEN_OBJECT,
  stripTokenSeparators,
  repairTokenSeparators,
  partsToDoc,
  docToParts,
  orderedPartsFromMap,
  rebuildTokenMapFromDoc,
  docPosToPlainTextOffset,
  plainTextOffsetToDocPos,
  splitPartsAtPlainRange,
  type PositionTokenMap,
} from "./serialize";
import { ComposerTokenChip } from "../inline-tokens";

export type TokenMap = PositionTokenMap;

export const setTokenMapEffect = StateEffect.define<TokenMap>();

function cloneTokenMap(map: TokenMap): TokenMap {
  return new Map(map);
}

/** Every doc edit gets an explicit token-map effect so undo/redo can restore full sentences. */
export const syncTokenMapOnDocChange = EditorState.transactionExtender.of((tr) => {
  if (!tr.docChanged) return null;
  if (tr.effects.some((e) => e.is(setTokenMapEffect))) return null;
  const ordered = orderedPartsFromMap(tr.startState.field(tokenMapStateField));
  const nextDoc = tr.changes.apply(tr.startState.doc).toString();
  const nextMap = rebuildTokenMapFromDoc(nextDoc, ordered);
  return { effects: setTokenMapEffect.of(nextMap) };
});

/** Wire token-map effects into CodeMirror undo/redo (see inverted-effect example). */
export const composerTokenHistory = invertedEffects.of((tr) => {
  const inverted: StateEffect<TokenMap>[] = [];
  const startMap = cloneTokenMap(tr.startState.field(tokenMapStateField));
  for (const effect of tr.effects) {
    if (effect.is(setTokenMapEffect)) {
      inverted.push(setTokenMapEffect.of(startMap));
    }
  }
  if (inverted.length === 0 && tr.docChanged) {
    inverted.push(setTokenMapEffect.of(startMap));
  }
  return inverted;
});

export const tokenMapStateField = StateField.define<TokenMap>({
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
    root.render(createElement(ComposerTokenChip, { part: this.part }));
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

function iterObjectTokenPositions(doc: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < doc.length; i++) {
    if (doc[i] === TOKEN_OBJECT) positions.push(i);
  }
  return positions;
}

function buildTokenDecorations(state: EditorState, tokenMap: TokenMap) {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc.toString();
  for (const pos of iterObjectTokenPositions(doc)) {
    const part = tokenMap.get(pos);
    if (!part || part.type === "text") continue;
    builder.add(
      pos,
      pos + 1,
      Decoration.replace({
        widget: new TokenWidget(part),
        inclusive: false,
      }),
    );
  }
  return builder.finish();
}

export const tokenDecorationsField = StateField.define<ReturnType<typeof buildTokenDecorations>>({
  create(state) {
    return buildTokenDecorations(state, state.field(tokenMapStateField));
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

export const composerTokenAtomicRanges = EditorView.atomicRanges.of((view) =>
  view.state.field(tokenDecorationsField),
);

function expandRangeToTokenBoundaries(
  doc: string,
  from: number,
  to: number,
): { from: number; to: number; expanded: boolean } {
  let expandedFrom = from;
  let expandedTo = to;
  let expanded = false;
  for (const pos of iterObjectTokenPositions(doc)) {
    const overlaps = pos < expandedTo && pos + 1 > expandedFrom;
    if (!overlaps) continue;
    if (pos < expandedFrom || pos + 1 > expandedTo) expanded = true;
    expandedFrom = Math.min(expandedFrom, pos);
    expandedTo = Math.max(expandedTo, pos + 1);
  }
  return { from: expandedFrom, to: expandedTo, expanded };
}

function removeTokensInRange(tokenMap: TokenMap, from: number, to: number): TokenMap {
  const next = new Map(tokenMap);
  for (const pos of [...next.keys()]) {
    if (pos >= from && pos < to) next.delete(pos);
  }
  return next;
}

function deleteObjectTokenAt(view: EditorView, pos: number): void {
  const doc = view.state.doc.toString();
  const tokenMap = removeTokensInRange(view.state.field(tokenMapStateField), pos, pos + 1);
  view.dispatch({
    changes: { from: pos, to: pos + 1 },
    selection: EditorSelection.cursor(pos),
    effects: setTokenMapEffect.of(
      rebuildTokenMapFromDoc(
        doc.slice(0, pos) + doc.slice(pos + 1),
        orderedPartsFromMap(tokenMap),
      ),
    ),
  });
}

/** Map cursor after full doc replace using plain-text offset from old doc to new doc. */
export function selectionAfterDocReplace(
  oldDoc: string,
  newDoc: string,
  head: number,
  _assoc: -1 | 0 | 1 = 0,
): EditorSelection {
  const plain = docPosToPlainTextOffset(oldDoc, head);
  const mapped = plainTextOffsetToDocPos(newDoc, plain);
  return EditorSelection.create([
    EditorSelection.cursor(Math.max(0, Math.min(mapped, newDoc.length))),
  ]);
}

/** No-op — object tokens don't have interior positions. */
export function normalizeComposerSelection(_view: EditorView): boolean {
  return false;
}

export function repairComposerDocIfNeeded(view: EditorView): boolean {
  const doc = view.state.doc.toString();
  if (doc.includes("\u200B")) {
    const { doc: repaired, changed } = repairTokenSeparators(doc);
    if (changed) {
      const cursor = view.state.selection.main;
      view.dispatch({
        changes: { from: 0, to: doc.length, insert: repaired },
        selection: selectionAfterDocReplace(doc, repaired, cursor.head),
      });
      return true;
    }
  }
  return false;
}

export const composerTokenTransactionFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;

  const doc = tr.startState.doc.toString();
  const changes: { from: number; to: number; insert: string }[] = [];
  let modified = false;
  let expandedFrom = Number.POSITIVE_INFINITY;
  let expandedTo = 0;

  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (inserted.length === 0 && fromA < toA) {
      const expanded = expandRangeToTokenBoundaries(doc, fromA, toA);
      if (expanded.expanded) {
        modified = true;
        expandedFrom = Math.min(expandedFrom, expanded.from);
        expandedTo = Math.max(expandedTo, expanded.to);
        changes.push({ from: expanded.from, to: expanded.to, insert: "" });
        return;
      }
    }
    changes.push({ from: fromA, to: toA, insert: inserted.toString() });
  });

  if (!modified) return tr;

  let nextMap = tr.startState.field(tokenMapStateField);
  for (const ch of changes) {
    if (ch.from < ch.to && ch.insert === "") {
      nextMap = removeTokensInRange(nextMap, ch.from, ch.to);
    }
  }

  const cursorPos = expandedFrom < expandedTo ? expandedFrom : tr.startState.selection.main.head;

  return tr.startState.update({
    changes,
    selection: EditorSelection.cursor(cursorPos),
    effects: [
      ...tr.effects,
      setTokenMapEffect.of(
        rebuildTokenMapFromDoc(
          applyChangesToDoc(doc, changes),
          orderedPartsFromMap(nextMap),
        ),
      ),
    ],
  });
});

function applyChangesToDoc(
  doc: string,
  changes: { from: number; to: number; insert: string }[],
): string {
  let result = doc;
  for (const ch of [...changes].sort((a, b) => b.from - a.from)) {
    result = result.slice(0, ch.from) + ch.insert + result.slice(ch.to);
  }
  return result;
}

/** Backspace — delete object token only when cursor is immediately after it. */
export function atomicTokenBackspace(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const doc = state.doc.toString();

  if (!sel.empty) {
    const expanded = expandRangeToTokenBoundaries(doc, sel.from, sel.to);
    if (expanded.expanded) {
      const tokenMap = removeTokensInRange(
        state.field(tokenMapStateField),
        expanded.from,
        expanded.to,
      );
      view.dispatch({
        changes: { from: expanded.from, to: expanded.to },
        selection: EditorSelection.cursor(expanded.from),
        effects: setTokenMapEffect.of(
          rebuildTokenMapFromDoc(
            doc.slice(0, expanded.from) + doc.slice(expanded.to),
            orderedPartsFromMap(tokenMap),
          ),
        ),
      });
      return true;
    }
    return false;
  }

  const pos = sel.head;
  if (pos > 0 && doc[pos - 1] === TOKEN_OBJECT) {
    deleteObjectTokenAt(view, pos - 1);
    return true;
  }

  return false;
}

/** Delete — remove object token when cursor is immediately before it. */
export function atomicTokenDeleteForward(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const doc = state.doc.toString();

  if (!sel.empty) {
    const expanded = expandRangeToTokenBoundaries(doc, sel.from, sel.to);
    if (expanded.expanded) {
      const tokenMap = removeTokensInRange(
        state.field(tokenMapStateField),
        expanded.from,
        expanded.to,
      );
      view.dispatch({
        changes: { from: expanded.from, to: expanded.to },
        selection: EditorSelection.cursor(expanded.from),
        effects: setTokenMapEffect.of(
          rebuildTokenMapFromDoc(
            doc.slice(0, expanded.from) + doc.slice(expanded.to),
            orderedPartsFromMap(tokenMap),
          ),
        ),
      });
      return true;
    }
    return false;
  }

  if (posAtCursorIsObjectToken(doc, sel.head)) {
    deleteObjectTokenAt(view, sel.head);
    return true;
  }

  return false;
}

function posAtCursorIsObjectToken(doc: string, pos: number): boolean {
  return pos < doc.length && doc[pos] === TOKEN_OBJECT;
}

/** Default arrow keys — no custom assoc logic needed. */
export function adjustComposerHorizontalCursor(_view: EditorView, _dir: -1 | 1): boolean {
  return false;
}

export function insertComposerToken(
  view: EditorView,
  part: Exclude<ComposerPart, { type: "text" }>,
  replaceFrom: number,
  replaceTo: number,
): void {
  insertComposerParts(view, [part], replaceFrom, replaceTo);
}

export function insertComposerParts(
  view: EditorView,
  parts: ComposerPart[],
  replaceFrom: number,
  replaceTo: number,
): void {
  const merged = mergeAdjacentText(parts);
  const doc = view.state.doc.toString();
  const allParts = readPartsFromView(view);
  const plainFrom = docPosToPlainTextOffset(doc, replaceFrom);
  const plainTo = docPosToPlainTextOffset(doc, replaceTo);
  const { before, after } = splitPartsAtPlainRange(allParts, plainFrom, plainTo);
  const combined = mergeAdjacentText([...before, ...merged, ...after]);
  const { doc: newDoc, tokenMap } = partsToDoc(combined);
  const { doc: prefixDoc } = partsToDoc(mergeAdjacentText([...before, ...merged]));
  const cursor = prefixDoc.length;

  view.dispatch({
    changes: { from: 0, to: doc.length, insert: newDoc },
    selection: EditorSelection.cursor(cursor),
    effects: setTokenMapEffect.of(tokenMap),
  });
}

export function syncTokenMapFromParts(view: EditorView, parts: ComposerPart[]): void {
  const { doc: expectedDoc, tokenMap } = partsToDoc(parts);
  const currentDoc = view.state.doc.toString();
  if (currentDoc !== expectedDoc) return;
  const current = view.state.field(tokenMapStateField);
  if (mapsEqual(current, tokenMap)) return;
  view.dispatch({ effects: setTokenMapEffect.of(tokenMap) });
}

function mapsEqual(a: TokenMap, b: TokenMap): boolean {
  if (a.size !== b.size) return false;
  for (const [pos, part] of a) {
    const other = b.get(pos);
    if (!other || part.type === "text" || other.type === "text") return false;
    if (other.id !== part.id) return false;
  }
  return true;
}

export function readPartsFromView(view: EditorView): ComposerPart[] {
  const doc = view.state.doc.toString();
  const tokenMap = view.state.field(tokenMapStateField);
  return docToParts(doc, tokenMap);
}

export function linkifyViewIfNeeded(view: EditorView): boolean {
  const parts = readPartsFromView(view);
  const expanded = expandLinkTokensInParts(parts);
  const { doc: nextDoc, tokenMap: nextMap } = partsToDoc(expanded);
  const currentDoc = view.state.doc.toString();
  if (stripTokenSeparators(currentDoc) === stripTokenSeparators(nextDoc)) return false;

  const cursor = view.state.selection.main;
  view.dispatch({
    changes: { from: 0, to: currentDoc.length, insert: nextDoc },
    selection: selectionAfterDocReplace(currentDoc, nextDoc, cursor.head),
    effects: setTokenMapEffect.of(nextMap),
  });
  return true;
}

/** @deprecated Use atomicTokenBackspace */
export function atomicTokenDelete(view: EditorView): boolean {
  return atomicTokenBackspace(view);
}
