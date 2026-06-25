import { getChunks } from "@codemirror/merge";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { buildLineKindMap } from "./diff-chunk-lines";

const delLineDeco = Decoration.line({ class: "git-diff-line-del" });
const insLineDeco = Decoration.line({ class: "git-diff-line-ins" });

function chunksChanged(update: ViewUpdate): boolean {
  const cur = getChunks(update.state);
  const prev = getChunks(update.startState);
  if (!cur && !prev) return false;
  if (!cur || !prev) return true;
  if (cur.side !== prev.side) return true;
  if (cur.chunks.length !== prev.chunks.length) return true;
  for (let i = 0; i < cur.chunks.length; i++) {
    const c = cur.chunks[i];
    const p = prev.chunks[i];
    if (
      c.fromA !== p.fromA ||
      c.toA !== p.toA ||
      c.fromB !== p.fromB ||
      c.toB !== p.toB
    ) {
      return true;
    }
  }
  return false;
}

function buildLineDecorations(view: EditorView): DecorationSet {
  const result = getChunks(view.state);
  if (!result) return Decoration.none;

  const kindMap = buildLineKindMap(view.state.doc, result.chunks, result.side);
  if (kindMap.size === 0) return Decoration.none;

  const builder = new RangeSetBuilder<Decoration>();
  const sorted = [...kindMap.entries()].sort((a, b) => a[0] - b[0]);

  for (const [lineNo, kind] of sorted) {
    if (lineNo < 1 || lineNo > view.state.doc.lines) continue;
    const line = view.state.doc.line(lineNo);
    builder.add(line.from, line.from, kind === "del" ? delLineDeco : insLineDeco);
  }

  return builder.finish();
}

/** Chunk-driven line backgrounds — survives theme/language DOM rebuilds. */
export function gitDiffLineHighlights() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildLineDecorations(view);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.geometryChanged ||
          chunksChanged(update)
        ) {
          this.decorations = buildLineDecorations(update.view);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
