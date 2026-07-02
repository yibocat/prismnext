import { cn } from "@/lib/utils";
import { useLiteratureBlocks } from "./literature-block-context";

/** Toolbar toggle for block-pick mode (single-click select). */
export function LiteratureBlockPickToggle() {
  const { hasBlocks, blockPickMode, setBlockPickMode } = useLiteratureBlocks();
  if (!hasBlocks) return null;

  return (
    <button
      type="button"
      className={cn(
        "rounded px-2 py-0.5 text-[length:var(--font-size-11)] transition-colors",
        blockPickMode
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
      title="Block pick mode — click blocks to toggle (Shift+Click works anytime; multi-select)"
      onClick={() => setBlockPickMode(!blockPickMode)}
    >
      Blocks
    </button>
  );
}
