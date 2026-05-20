import { CogIcon, GlobeIcon, FileTextIcon, ZapIcon } from "lucide-react";

export function BottomBar() {
  return (
    <div className="flex h-6 shrink-0 items-center border-t border-border bg-card px-3 text-[11px] text-muted-foreground select-none">
      {/* Compile trigger + status — gray=idle, green=success, yellow=compiling, red=error */}
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors"
        title="Compile"
      >
        <ZapIcon className="size-3" />
        Ready
      </button>

      <div className="mx-1 h-3 w-px bg-border/60" />

      {/* Engine */}
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors"
      >
        <CogIcon className="size-3" />
        LuaLaTeX
      </button>

      <span className="flex-1" />

      {/* Cursor position */}
      <button
        type="button"
        className="rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors"
      >
        Ln 42, Col 8
      </button>

      <div className="mx-1 h-3 w-px bg-border/60" />

      {/* Encoding */}
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors"
      >
        <GlobeIcon className="size-3" />
        UTF-8
      </button>

      <div className="mx-1 h-3 w-px bg-border/60" />

      {/* Language mode */}
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors"
      >
        <FileTextIcon className="size-3" />
        LaTeX
      </button>
    </div>
  );
}
