import { useCompileStore } from "@/stores/compile-store";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { resolveCompileTarget } from "@/lib/tex/resolve-tex-root";
import { hasCompileProblems } from "./parse-latex-log";
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
  AlertCircleIcon,
} from "lucide-react";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuItem,
  AppMenuLabel,
  AppMenuSeparator,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SYMBOL_CATEGORIES, getSymbolHtml } from "@/lib/tex/latex-symbols";
import { cn } from "@/lib/utils";

interface TexworkspaceToolbarProps {
  compileFile: string | null | undefined;
}

const ENGINE_LABELS: Record<string, string> = {
  tectonic: "Tectonic",
  texlive: "TeXLive",
};

export function TexworkspaceToolbar({ compileFile }: TexworkspaceToolbarProps) {
  const { t } = useTranslation();
  const isCompiling = useCompileStore((s) => s.isCompiling);
  const compile = useCompileStore((s) => s.compile);
  const compileError = useCompileStore((s) => s.compileError);
  const compileLog = useCompileStore((s) => s.compileLog);
  const autoCompile = useCompileStore((s) => s.autoCompile);
  const toggleAutoCompile = useCompileStore((s) => s.toggleAutoCompile);
  const compilerBackend = useCompileStore((s) => s.compilerBackend);
  const setCompilerBackend = useCompileStore((s) => s.setCompilerBackend);
  const texworkspaceViewMode = useLayoutStore((s) => s.texworkspaceViewMode);
  const setTexworkspaceViewMode = useLayoutStore((s) => s.setTexworkspaceViewMode);
  const texworkspaceProblemsOpen = useLayoutStore((s) => s.texworkspaceProblemsOpen);
  const setTexworkspaceProblemsOpen = useLayoutStore((s) => s.setTexworkspaceProblemsOpen);
  const searchQuery = useLayoutStore((s) => s.texworkspaceSearchQuery);
  const setSearchQuery = useLayoutStore((s) => s.setTexworkspaceSearchQuery);
  const requestInsertText = useDocumentStore((s) => s.requestInsertText);

  const showProblemsButton = hasCompileProblems(compileError, compileLog);

  const handleToggleProblems = () => {
    if (texworkspaceProblemsOpen) {
      setTexworkspaceProblemsOpen(false);
      return;
    }
    if (texworkspaceViewMode === "tex") {
      setTexworkspaceViewMode("split");
    }
    setTexworkspaceProblemsOpen(true);
  };

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
          title={t("modes.texworkspace.viewSplit")}
          className={cn(
            "flex size-6 items-center justify-center rounded-sm transition-colors",
            texworkspaceViewMode === "split"
              ? "bg-muted text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Columns2Icon className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setTexworkspaceViewMode("tex")}
          title={t("modes.texworkspace.viewTex")}
          className={cn(
            "flex size-6 items-center justify-center rounded-sm transition-colors",
            texworkspaceViewMode === "tex"
              ? "bg-muted text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <FileTextIcon className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setTexworkspaceViewMode("pdf")}
          title={t("modes.texworkspace.viewPdf")}
          className={cn(
            "flex size-6 items-center justify-center rounded-sm transition-colors",
            texworkspaceViewMode === "pdf"
              ? "bg-muted text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <EyeIcon className="size-3.5" />
        </button>
      </div>

      {/* Compile button */}
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
        title={t("modes.texworkspace.compile", { engine: ENGINE_LABELS[compilerBackend] })}
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
      <AppMenu>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 h-6 px-1.5 rounded text-[length:var(--font-menu-item)] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
            title="Select compiler"
          >
            <span>{ENGINE_LABELS[compilerBackend]}</span>
            <ChevronDownIcon className="size-3" />
          </button>
        </AppMenuTrigger>
        <AppMenuContent align="start" className="min-w-[6.5rem]">
          <AppMenuCheckItem
            selected={compilerBackend === "tectonic"}
            onClick={() => setCompilerBackend("tectonic")}
          >
            Tectonic
          </AppMenuCheckItem>
          <AppMenuCheckItem
            selected={compilerBackend === "texlive"}
            onClick={() => setCompilerBackend("texlive")}
          >
            TeXLive
          </AppMenuCheckItem>
        </AppMenuContent>
      </AppMenu>

      {/* Auto-compile toggle */}
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        onClick={toggleAutoCompile}
        title={autoCompile ? t("modes.texworkspace.autoCompileOn") : t("modes.texworkspace.autoCompileOff")}
      >
        {autoCompile ? (
          <ZapIcon className="size-3.5 text-warning" />
        ) : (
          <ZapOffIcon className="size-3.5" />
        )}
      </button>

      {showProblemsButton && (
        <button
          type="button"
          className={cn(
            "flex size-6 items-center justify-center rounded transition-colors shrink-0",
            texworkspaceProblemsOpen
              ? "bg-destructive/15 text-destructive"
              : "text-destructive hover:bg-destructive/10",
          )}
          title={texworkspaceProblemsOpen ? t("modes.texworkspace.backToPdf") : t("modes.texworkspace.showProblems")}
          onClick={handleToggleProblems}
        >
          <AlertCircleIcon className="size-3.5" />
        </button>
      )}

      <div className="flex-1" />

      {/* Search toggle — drives sidebar project search */}
      <button
        type="button"
        className={cn(
          "flex size-6 items-center justify-center rounded transition-colors shrink-0",
          isSearching
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
        title={t("modes.texworkspace.searchManuscript")}
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
            title={t("modes.texworkspace.insertSymbol")}
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
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Environment Insertion */}
      <AppMenu>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            title={t("modes.texworkspace.insertEnv")}
          >
            <BookOpenIcon className="size-3.5" />
          </button>
        </AppMenuTrigger>
        <AppMenuContent align="end" className="w-40">
          <AppMenuLabel>Common</AppMenuLabel>
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
            <AppMenuItem
              key={item.env}
              onClick={() => requestInsertText(`\\begin{${item.env}}\n  \n\\end{${item.env}}`)}
            >
              {item.label}
            </AppMenuItem>
          ))}
          <AppMenuSeparator />
          <AppMenuLabel>Theorem-like</AppMenuLabel>
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
            <AppMenuItem
              key={item.env}
              onClick={() => requestInsertText(`\\begin{${item.env}}\n  \n\\end{${item.env}}`)}
            >
              {item.label}
            </AppMenuItem>
          ))}
        </AppMenuContent>
      </AppMenu>
    </>
  );
}
