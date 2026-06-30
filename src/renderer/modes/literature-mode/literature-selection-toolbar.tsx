import { NotebookPenIcon } from "lucide-react";
import { SelectionTooltip, useSelectionDimensions } from "@anaralabs/lector";
import { insertPaperQuoteIntoNote } from "@/lib/literature/insert-paper-quote";
import { cn } from "@/lib/utils";
import type { LiteraturePaper } from "@/types/electron.d";

const actionBtn = cn(
  "flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-size-11)]",
  "text-foreground hover:bg-accent transition-colors",
);

export function LiteratureSelectionToolbar({ paper }: { paper: LiteraturePaper }) {
  const { getDimension } = useSelectionDimensions();

  const handleInsert = () => {
    const dim = getDimension();
    if (!dim?.text?.trim()) return;
    const page = dim.highlights[0]?.pageNumber ?? 1;
    void insertPaperQuoteIntoNote(paper, dim.text, page);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <SelectionTooltip>
      <div
        className="flex items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 shadow-md"
        data-annotation-tooltip
      >
        <button
          type="button"
          className={actionBtn}
          title="Insert selection into reading note"
          onClick={handleInsert}
        >
          <NotebookPenIcon className="size-3.5" />
          Insert into note
        </button>
      </div>
    </SelectionTooltip>
  );
}
