import type { EditorView } from "@codemirror/view";
import { detectQueryAtCursor, type ComposerQuery } from "./query";
import type { CursorAnchor } from "./dropdown-position";
import { anchorFromCoords } from "./dropdown-position";

export function readComposerQuery(view: EditorView): ComposerQuery | null {
  const cursor = view.state.selection.main.head;
  return detectQueryAtCursor(view.state.doc.toString(), cursor);
}

export function anchorForComposerQuery(view: EditorView): CursorAnchor | null {
  const cursor = view.state.selection.main.head;
  const coords = view.coordsAtPos(cursor);
  if (!coords) return null;
  return anchorFromCoords(coords);
}

/** Keep query state in sync with the document. Anchor persists while @ or / query is active. */
export function syncComposerQueryState(
  view: EditorView,
  setQuery: (query: ComposerQuery | null) => void,
  setAnchor: (anchor: CursorAnchor | null) => void,
  prevQueryKeyRef?: { current: string },
): ComposerQuery | null {
  const query = readComposerQuery(view);
  const queryKey = query
    ? `${query.kind}\x01${query.from}\x01${query.to}\x01${query.query}`
    : "";
  const prevKey = prevQueryKeyRef?.current ?? "";
  if (queryKey !== prevKey) {
    if (prevQueryKeyRef) prevQueryKeyRef.current = queryKey;
    setQuery(query);
  }
  if (query) {
    setAnchor(anchorForComposerQuery(view));
  } else if (prevKey !== "") {
    setAnchor(null);
  }
  return query;
}
