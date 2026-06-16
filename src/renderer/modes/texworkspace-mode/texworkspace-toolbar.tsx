import { useState, useEffect } from "react";
import { useCompileStore, clearPdfCache } from "@/stores/compile-store";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { DEFAULT_MANUSCRIPT_DIR } from "@/types/workspace";
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
  ChevronDownIcon,
  SearchIcon,
  SigmaIcon,
  BookOpenIcon,
  HistoryIcon,
  RotateCcwIcon,
  CalendarIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SYMBOL_CATEGORIES, getSymbolHtml, preRenderAllSymbols } from "@/lib/latex-symbols";

interface TexworkspaceToolbarProps {
  compileFile: string | null | undefined;
}

const ENGINE_LABELS: Record<string, string> = {
  tectonic: "Tectonic",
  texlive: "TeXLive",
};

export function TexworkspaceToolbar({ compileFile }: TexworkspaceToolbarProps) {
  const isCompiling = useCompileStore((s) => s.isCompiling);
  const compile = useCompileStore((s) => s.compile);
  const autoCompile = useCompileStore((s) => s.autoCompile);
  const toggleAutoCompile = useCompileStore((s) => s.toggleAutoCompile);
  const compilerBackend = useCompileStore((s) => s.compilerBackend);
  const setCompilerBackend = useCompileStore((s) => s.setCompilerBackend);
  const texworkspaceViewMode = useLayoutStore((s) => s.texworkspaceViewMode);
  const setTexworkspaceViewMode = useLayoutStore((s) => s.setTexworkspaceViewMode);
  const searchQuery = useLayoutStore((s) => s.texworkspaceSearchQuery);
  const setSearchQuery = useLayoutStore((s) => s.setTexworkspaceSearchQuery);
  const requestInsertText = useDocumentStore((s) => s.requestInsertText);

  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const manuscriptConfig = useWorkspaceConfigStore((s) => s.manuscriptConfig);
  const manuscriptDir = manuscriptConfig?.dir ?? DEFAULT_MANUSCRIPT_DIR;
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [backups, setBackups] = useState<{ label: string; timestamp: string; files: string[] }[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!restoreOpen || !projectRoot) return;
    setRestoreError(null);
    window.electronAPI.templateListBackups({ rootPath: projectRoot }).then(setBackups).catch(() => setBackups([]));
  }, [restoreOpen, projectRoot]);

  const handleCompile = async () => {
    const { projectRoot, files, getContent } = useDocumentStore.getState();
    if (!projectRoot) {
      console.warn("[texworkspace-toolbar] Compile blocked: no project root");
      return;
    }
    if (!compileFile) {
      console.warn("[texworkspace-toolbar] Compile blocked: no file open in texworkspace tab");
      toast.error("No file open to compile. Open a .tex file first.");
      return;
    }
    const resolved = resolveCompileTarget(compileFile, files, getContent);
    if (resolved) {
      await compile(projectRoot, resolved.targetPath);
    } else {
      console.warn("[texworkspace-toolbar] Compile blocked: could not resolve compile target from file", compileFile);
      toast.error("Could not determine which file to compile. Make sure your document has a \\documentclass declaration.");
    }
  };

  const isSearching = searchQuery !== "";

  return (
    <>
      {/* View mode toggles — far left */}
      <div className="flex items-center shrink-0 rounded-md border border-border/40 p-0.5 gap-px">
        <button
          type="button"
          onClick={() => setTexworkspaceViewMode("split")}
          title="Split view"
          className={`flex size-6 items-center justify-center rounded-sm transition-colors ${
            texworkspaceViewMode === "split"
              ? "bg-muted text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Columns2Icon className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setTexworkspaceViewMode("tex")}
          title="TeX only"
          className={`flex size-6 items-center justify-center rounded-sm transition-colors ${
            texworkspaceViewMode === "tex"
              ? "bg-muted text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileTextIcon className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setTexworkspaceViewMode("pdf")}
          title="PDF only"
          className={`flex size-6 items-center justify-center rounded-sm transition-colors ${
            texworkspaceViewMode === "pdf"
              ? "bg-muted text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <EyeIcon className="size-3.5" />
        </button>
      </div>


      {/* Compile button */}
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
        title={`Compile (${ENGINE_LABELS[compilerBackend]})`}
        onClick={handleCompile}
        disabled={isCompiling || !compileFile}
      >
        {isCompiling ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <PlayIcon className="size-3.5" />
        )}
      </button>

      {/* Compiler engine selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 h-6 px-1.5 rounded text-[length:var(--font-size-12)] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
            title="Select compiler"
          >
            <span>{ENGINE_LABELS[compilerBackend]}</span>
            <ChevronDownIcon className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-28">
          <DropdownMenuItem
            onClick={() => setCompilerBackend("tectonic")}
            className="cursor-pointer text-xs gap-2"
          >
            <span>Tectonic</span>
            {compilerBackend === "tectonic" && (
              <span className="ml-auto text-muted-foreground">✓</span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setCompilerBackend("texlive")}
            className="cursor-pointer text-xs gap-2"
          >
            <span>TeXLive</span>
            {compilerBackend === "texlive" && (
              <span className="ml-auto text-muted-foreground">✓</span>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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


      {/* Spacer — pushes right group to the end */}
      <div className="flex-1" />

      {/* Search toggle */}
      <button
        type="button"
        className={`flex size-6 items-center justify-center rounded transition-colors shrink-0 ${
          isSearching
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
        title="Search in project"
        onClick={() => setSearchQuery(isSearching ? "" : " ")}
      >
        <SearchIcon className="size-3.5" />
      </button>

      {/* Symbol Palette */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            title="Insert Symbol"
          >
            <SigmaIcon className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-[364px] p-0">
          <div className="max-h-[380px] overflow-y-auto overscroll-contain">
            {SYMBOL_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <div className="sticky top-0 z-10 bg-popover px-3 py-1 text-[length:var(--font-size-12)] font-medium text-muted-foreground border-b border-border/50 backdrop-blur-sm">
                  {cat.label}
                </div>
                <div className="grid grid-cols-8 gap-px px-1.5 py-1.5">
                  {cat.symbols.map((sym) => {
                    const html = getSymbolHtml(sym);
                    return (
                    <button
                      key={sym.command}
                      type="button"
                      className="flex items-center justify-center rounded-sm h-9 hover:bg-accent transition-colors"
                      title={sym.command}
                      onClick={() => requestInsertText(sym.command + " ")}
                    >
                      {html ? (
                        <span
                          className="katex-symbol inline-flex items-center justify-center text-sm"
                          dangerouslySetInnerHTML={{ __html: html }}
                        />
                      ) : (
                        <span className="text-sm">{sym.display}</span>
                      )}
                    </button>
                  )})}
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Environment Insertion */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            title="Insert Environment"
          >
            <BookOpenIcon className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <div className="px-2 py-1 text-[length:var(--font-hint)] text-muted-foreground/60 uppercase tracking-wider">Common</div>
          {[
            { label: "Figure", env: "figure" },
            { label: "Table", env: "table" },
            { label: "Equation", env: "equation" },
            { label: "Align", env: "align" },
            { label: "Itemize", env: "itemize" },
            { label: "Enumerate", env: "enumerate" },
            { label: "Description", env: "description" },
            { label: "Center", env: "center" },
          ].map((item) => (
            <DropdownMenuItem
              key={item.env}
              onClick={() => requestInsertText(`\\begin{${item.env}}\n  \n\\end{${item.env}}`)}
              className="cursor-pointer text-xs"
            >
              {item.label}
            </DropdownMenuItem>
          ))}
          <div className="border-t mt-1 pt-1 px-2 py-1 text-[length:var(--font-hint)] text-muted-foreground/60 uppercase tracking-wider">Theorem-like</div>
          {[
            { label: "Theorem", env: "theorem" },
            { label: "Lemma", env: "lemma" },
            { label: "Corollary", env: "corollary" },
            { label: "Proposition", env: "proposition" },
            { label: "Definition", env: "definition" },
            { label: "Example", env: "example" },
            { label: "Remark", env: "remark" },
            { label: "Proof", env: "proof" },
          ].map((item) => (
            <DropdownMenuItem
              key={item.env}
              onClick={() => requestInsertText(`\\begin{${item.env}}\n  \n\\end{${item.env}}`)}
              className="cursor-pointer text-xs"
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Restore backup button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        title="Restore from backup"
        onClick={() => setRestoreOpen(true)}
      >
        <HistoryIcon className="size-4" />
      </Button>
      {/* Backup restore dialog */}
      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent className="!max-w-lg max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Restore from Backup</DialogTitle>
            <DialogDescription>
              Select a backup to restore. Current files will be overwritten.
            </DialogDescription>
          </DialogHeader>

          {restoreError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[length:var(--font-size-12)] text-destructive mb-3">
              {restoreError}
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {backups.length === 0 ? (
              <p className="text-center text-muted-foreground text-[length:var(--font-size-13)] py-8">
                No backups found
              </p>
            ) : (
              backups.map((b) => {
                const firstUnderscore = b.label.indexOf("_");
                const rest = firstUnderscore > 0 ? b.label.slice(firstUnderscore + 1) : b.label;
                const toIdx = rest.lastIndexOf("_to_");
                const from = toIdx > 0 ? rest.slice(0, toIdx) : rest;
                const to = toIdx > 0 ? rest.slice(toIdx + 4) : "";
                const isRestoring = restoring === b.label;

                return (
                  <div key={b.label} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                    <HistoryIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[length:var(--font-size-12)] font-medium">
                        {from} → {to}
                      </div>
                      <div className="text-[length:var(--font-size-11)] text-muted-foreground">
                        {b.timestamp ? new Date(b.timestamp).toLocaleString() : b.label} · {b.files.length} files
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[length:var(--font-size-11)] shadow-none"
                      disabled={!!restoring}
                      onClick={async () => {
                        if (!projectRoot) return;
                        setRestoreError(null);
                        setRestoring(b.label);
                        try {
                          await window.electronAPI.templateRestoreBackup({
                            rootPath: projectRoot,
                            manuscriptDir,
                            backupLabel: b.label,
                          });
                          clearPdfCache();
                          useDocumentStore.getState().refreshFiles();
                          setRestoreOpen(false);
                          toast.success("Backup restored — files recovered");
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Restore failed";
                          setRestoreError(msg);
                          toast.error(`Restore failed: ${msg}`);
                        }
                        setRestoring(null);
                      }}
                    >
                      <RotateCcwIcon className="size-3 mr-1" />
                      {isRestoring ? "Restoring…" : "Restore"}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
