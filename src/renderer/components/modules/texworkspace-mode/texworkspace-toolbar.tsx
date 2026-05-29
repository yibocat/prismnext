import { useCompileStore } from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { resolveCompileTarget } from "@/lib/resolve-tex-root";
import { Toggle } from "@/components/ui/toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  PlayIcon,
  Loader2Icon,
  ZapIcon,
  ZapOffIcon,
  Columns2Icon,
  FileTextIcon,
  EyeIcon,
  ScrollTextIcon,
} from "lucide-react";

interface TexworkspaceToolbarProps {
  compileFile: string | null | undefined;
}

export function TexworkspaceToolbar({ compileFile }: TexworkspaceToolbarProps) {
  const isCompiling = useCompileStore((s) => s.isCompiling);
  const compile = useCompileStore((s) => s.compile);
  const autoCompile = useCompileStore((s) => s.autoCompile);
  const toggleAutoCompile = useCompileStore((s) => s.toggleAutoCompile);
  const compileError = useCompileStore((s) => s.compileError);
  const texworkspaceViewMode = useLayoutStore((s) => s.texworkspaceViewMode);
  const setTexworkspaceViewMode = useLayoutStore((s) => s.setTexworkspaceViewMode);

  const handleCompile = async () => {
    const { projectRoot, files, getContent } = useDocumentStore.getState();
    if (!projectRoot || !compileFile) return;
    const resolved = resolveCompileTarget(compileFile, files, getContent);
    if (resolved) await compile(projectRoot, resolved.targetPath);
  };

  return (
    <>
      {/* Compile */}
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
        title="Compile"
        onClick={handleCompile}
        disabled={isCompiling || !compileFile}
      >
        {isCompiling ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlayIcon className="size-3.5" />}
      </button>

      {/* Auto-compile toggle */}
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
        onClick={toggleAutoCompile}
        title={autoCompile ? "Auto-compile: ON" : "Auto-compile: OFF"}
      >
        {autoCompile ? (
          <ZapIcon className="size-3.5 text-yellow-500" />
        ) : (
          <ZapOffIcon className="size-3.5" />
        )}
      </button>

      {/* Compile log */}
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0",
              compileError && "text-amber-500",
            )}
            title="Compile log"
          >
            <ScrollTextIcon className="size-3.5" />
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-1/2">
          <SheetHeader>
            <SheetTitle>Compile Log</SheetTitle>
          </SheetHeader>
          <pre className="flex-1 overflow-auto rounded bg-muted/50 p-3 font-mono text-[length:var(--font-size-12)] whitespace-pre-wrap break-all">
            {compileError || "No errors. Last compilation succeeded."}
          </pre>
        </SheetContent>
      </Sheet>

      <div className="mx-1 h-4 w-px bg-border/60" />

      {/* View mode toggle group */}
      <Toggle
        size="sm"
        pressed={texworkspaceViewMode === "split"}
        onPressedChange={() => setTexworkspaceViewMode("split")}
        title="Split view"
        className="size-6 rounded-r-none p-0 data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
      >
        <Columns2Icon className="size-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={texworkspaceViewMode === "tex"}
        onPressedChange={() => setTexworkspaceViewMode("tex")}
        title="TeX only"
        className="size-6 rounded-none p-0 data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
      >
        <FileTextIcon className="size-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={texworkspaceViewMode === "pdf"}
        onPressedChange={() => setTexworkspaceViewMode("pdf")}
        title="PDF only"
        className="size-6 rounded-l-none p-0 data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
      >
        <EyeIcon className="size-3.5" />
      </Toggle>
    </>
  );
}
