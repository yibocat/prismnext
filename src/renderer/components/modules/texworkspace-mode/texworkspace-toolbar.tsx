import { useCompileStore } from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { resolveCompileTarget } from "@/lib/resolve-tex-root";
import {
  PlayIcon,
  Loader2Icon,
  ZapIcon,
  ZapOffIcon,
  Columns2Icon,
  FileTextIcon,
  EyeIcon,
} from "lucide-react";

interface TexworkspaceToolbarProps {
  compileFile: string | null | undefined;
}

export function TexworkspaceToolbar({ compileFile }: TexworkspaceToolbarProps) {
  const isCompiling = useCompileStore((s) => s.isCompiling);
  const compile = useCompileStore((s) => s.compile);
  const autoCompile = useCompileStore((s) => s.autoCompile);
  const toggleAutoCompile = useCompileStore((s) => s.toggleAutoCompile);
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
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        title="Compile"
        onClick={handleCompile}
        disabled={isCompiling || !compileFile}
      >
        {isCompiling ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlayIcon className="size-3.5" />}
      </button>

      {/* Auto-compile toggle */}
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        onClick={toggleAutoCompile}
        title={autoCompile ? "Auto-compile: ON" : "Auto-compile: OFF"}
      >
        {autoCompile ? (
          <ZapIcon className="size-3.5 text-warning" />
        ) : (
          <ZapOffIcon className="size-3.5" />
        )}
      </button>

<div className="mx-1 h-4 w-px bg-border/60" />

      {/* View mode toggles */}
      <button
        type="button"
        onClick={() => setTexworkspaceViewMode("split")}
        title="Split view"
        className={`flex size-6 items-center justify-center rounded transition-colors ${
          texworkspaceViewMode === "split"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        <Columns2Icon className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setTexworkspaceViewMode("tex")}
        title="TeX only"
        className={`flex size-6 items-center justify-center rounded transition-colors ${
          texworkspaceViewMode === "tex"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        <FileTextIcon className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setTexworkspaceViewMode("pdf")}
        title="PDF only"
        className={`flex size-6 items-center justify-center rounded transition-colors ${
          texworkspaceViewMode === "pdf"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        <EyeIcon className="size-3.5" />
      </button>
    </>
  );
}
