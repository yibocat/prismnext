import { getPdfBytes, useCompileStore } from "@/stores/compile-store";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore, type TexworkspaceViewMode } from "@/stores/layout-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { resolveCompileTarget } from "@/lib/tex/resolve-tex-root";
import { hasCompileProblems } from "./parse-latex-log";
import {
  PlayIcon,
  Loader2Icon,
  ZapIcon,
  ZapOffIcon,
  Columns2Icon,
  FileTextIcon,
  FileTypeIcon,
  ArrowLeftRightIcon,
  ChevronDownIcon,
  SearchIcon,
  SigmaIcon,
  BookOpenIcon,
  AlertCircleIcon,
  DownloadIcon,
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
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

interface TexworkspaceToolbarProps {
  compileFile: string | null | undefined;
}

const ENGINE_LABELS: Record<string, string> = {
  tectonic: "Tectonic",
  texlive: "TeXLive",
};

/** Segmented view-mode chip (selected = raised background). */
const VIEW_SEG_BTN =
  "flex size-6 shrink-0 items-center justify-center rounded-md transition-colors";

const VIEW_SEG_BTN_ACTIVE = "bg-background text-foreground shadow-sm";

const VIEW_SEG_BTN_IDLE =
  "text-muted-foreground hover:bg-muted hover:text-foreground";

/** Ghost icon button used across compile cluster + right tools. */
const TOOL_BTN =
  "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40";

const TOOL_BTN_ACTIVE = "bg-muted text-foreground hover:bg-muted hover:text-foreground";

const VIEW_MODES: {
  id: TexworkspaceViewMode;
  labelKey: "viewSplit" | "viewTex" | "viewPdf";
  Icon: typeof Columns2Icon;
}[] = [
  { id: "split", labelKey: "viewSplit", Icon: Columns2Icon },
  { id: "tex", labelKey: "viewTex", Icon: FileTextIcon },
  { id: "pdf", labelKey: "viewPdf", Icon: FileTypeIcon },
];

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
  const panesSwapped = useLayoutStore((s) => s.texworkspacePanesSwapped);
  const togglePanesSwapped = useLayoutStore((s) => s.toggleTexworkspacePanesSwapped);
  const texworkspaceProblemsOpen = useLayoutStore((s) => s.texworkspaceProblemsOpen);
  const setTexworkspaceProblemsOpen = useLayoutStore((s) => s.setTexworkspaceProblemsOpen);
  const searchQuery = useLayoutStore((s) => s.texworkspaceSearchQuery);
  const setSearchQuery = useLayoutStore((s) => s.setTexworkspaceSearchQuery);
  const requestInsertText = useDocumentStore((s) => s.requestInsertText);

  const showProblemsButton = hasCompileProblems(compileError, compileLog);
  const isSplit = texworkspaceViewMode === "split";

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

  const resolveExportMainFile = (): { projectRoot: string; mainFile: string } | null => {
    const { projectRoot, files, getContent } = useDocumentStore.getState();
    if (!projectRoot) return null;
    if (compileFile) {
      const resolved = resolveCompileTarget(compileFile, files, getContent);
      if (resolved) return { projectRoot, mainFile: resolved.targetPath };
    }
    const manuscript = useWorkspaceConfigStore.getState().manuscriptConfig;
    if (manuscript) {
      return {
        projectRoot,
        mainFile: `${manuscript.dir}/${manuscript.mainTex}`.replace(/\/+/g, "/"),
      };
    }
    return null;
  };

  const handleExportPdf = async () => {
    const target = resolveExportMainFile();
    if (!target) {
      toast.error(t("modes.texworkspace.exportNoTarget"));
      return;
    }
    const cached = getPdfBytes(target.projectRoot) ?? null;
    const result = await window.electronAPI.compileExportPdf(
      target.projectRoot,
      target.mainFile,
      cached,
    );
    if ("canceled" in result && result.canceled) return;
    if ("ok" in result && result.ok) {
      toast.success(t("modes.texworkspace.exportPdfSuccess"));
      return;
    }
    if ("error" in result && result.error === "no-pdf") {
      toast.error(t("modes.texworkspace.exportPdfMissing"));
      return;
    }
    toast.error(t("modes.texworkspace.exportFailed"));
  };

  const handlePackManuscript = async () => {
    const projectRoot = useDocumentStore.getState().projectRoot;
    const manuscript = useWorkspaceConfigStore.getState().manuscriptConfig;
    if (!projectRoot || !manuscript) {
      toast.error(t("modes.texworkspace.packNoManuscript"));
      return;
    }
    const result = await window.electronAPI.manuscriptPackZip(
      projectRoot,
      manuscript.dir,
    );
    if ("canceled" in result && result.canceled) return;
    if ("ok" in result && result.ok) {
      toast.success(t("modes.texworkspace.packManuscriptSuccess"));
      return;
    }
    if ("error" in result && result.error === "no-manuscript") {
      toast.error(t("modes.texworkspace.packNoManuscript"));
      return;
    }
    toast.error(t("modes.texworkspace.exportFailed"));
  };

  const handleSwapPanes = () => {
    if (texworkspaceViewMode !== "split") {
      setTexworkspaceViewMode("split");
    }
    togglePanesSwapped();
  };

  const isSearching = searchQuery !== "";

  return (
    <>
      {/* View segment + swap */}
      <div
        role="radiogroup"
        aria-label={t("modes.texworkspace.viewSplit")}
        className="flex h-7 shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-muted/50 p-0.5"
      >
        {VIEW_MODES.map(({ id, labelKey, Icon }) => {
          const active = texworkspaceViewMode === id;
          return (
            <Hint key={id} label={t(`modes.texworkspace.${labelKey}`)}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTexworkspaceViewMode(id)}
                className={cn(
                  VIEW_SEG_BTN,
                  active ? VIEW_SEG_BTN_ACTIVE : VIEW_SEG_BTN_IDLE,
                )}
              >
                <Icon className="size-3.5" />
              </button>
            </Hint>
          );
        })}

        <div className="mx-0.5 h-3.5 w-px shrink-0 bg-border/70" aria-hidden />

        <Hint label={t("modes.texworkspace.swapPanes")}>
          <button
            type="button"
            onClick={handleSwapPanes}
            className={cn(
              VIEW_SEG_BTN,
              panesSwapped
                ? VIEW_SEG_BTN_ACTIVE
                : isSplit
                  ? VIEW_SEG_BTN_IDLE
                  : "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
            )}
          >
            <ArrowLeftRightIcon className="size-3.5" />
          </button>
        </Hint>
      </div>

      {/* Compile cluster */}
      <div className="ml-1.5 flex shrink-0 items-center gap-0.5 border-l border-border/50 pl-1.5">
        <Hint
          label={t("modes.texworkspace.compile", { engine: ENGINE_LABELS[compilerBackend] })}
          shortcutId="product.compile"
        >
          <button
            type="button"
            className={cn(
              TOOL_BTN,
              !isCompiling && compileFile && "text-primary hover:text-primary",
            )}
            onClick={handleCompile}
            disabled={isCompiling || !compileFile}
          >
            {isCompiling ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <PlayIcon className="size-3.5" />
            )}
          </button>
        </Hint>

        <AppMenu>
          <Hint label="Select compiler">
            <AppMenuTrigger asChild>
              <button
                type="button"
                className="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[length:var(--font-menu-item)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <span>{ENGINE_LABELS[compilerBackend]}</span>
                <ChevronDownIcon className="size-3" />
              </button>
            </AppMenuTrigger>
          </Hint>
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

        <Hint label={autoCompile ? t("modes.texworkspace.autoCompileOn") : t("modes.texworkspace.autoCompileOff")}>
          <button
            type="button"
            className={cn(TOOL_BTN, autoCompile && "hover:bg-accent")}
            onClick={toggleAutoCompile}
          >
            {autoCompile ? (
              <ZapIcon className="size-3.5 text-warning" />
            ) : (
              <ZapOffIcon className="size-3.5" />
            )}
          </button>
        </Hint>

        {showProblemsButton && (
          <Hint label={texworkspaceProblemsOpen ? t("modes.texworkspace.backToPdf") : t("modes.texworkspace.showProblems")}>
            <button
              type="button"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-md transition-colors",
                texworkspaceProblemsOpen
                  ? "bg-destructive/15 text-destructive"
                  : "text-destructive hover:bg-destructive/10",
              )}
              onClick={handleToggleProblems}
            >
              <AlertCircleIcon className="size-3.5" />
            </button>
          </Hint>
        )}

        <AppMenu>
          <Hint label={t("modes.texworkspace.exportMenu")}>
            <AppMenuTrigger asChild>
              <button type="button" className={TOOL_BTN}>
                <DownloadIcon className="size-3.5" />
              </button>
            </AppMenuTrigger>
          </Hint>
          <AppMenuContent align="start" className="min-w-[12rem]">
            <AppMenuItem onClick={() => void handleExportPdf()}>
              {t("modes.texworkspace.exportPdf")}
            </AppMenuItem>
            <AppMenuItem onClick={() => void handlePackManuscript()}>
              {t("modes.texworkspace.packManuscript")}
            </AppMenuItem>
          </AppMenuContent>
        </AppMenu>
      </div>

      <div className="flex-1" />

      {/* Right tools */}
      <Hint label={t("modes.texworkspace.searchManuscript")}>
        <button
          type="button"
          className={cn(TOOL_BTN, isSearching && TOOL_BTN_ACTIVE)}
          onClick={() => setSearchQuery(isSearching ? "" : " ")}
        >
          <SearchIcon className="size-3.5" />
        </button>
      </Hint>

      <Popover>
        <Hint label={t("modes.texworkspace.insertSymbol")}>
          <PopoverTrigger asChild>
            <button type="button" className={TOOL_BTN}>
              <SigmaIcon className="size-3.5" />
            </button>
          </PopoverTrigger>
        </Hint>
        <PopoverContent side="bottom" align="end" className="w-[364px] p-0">
          <div className="max-h-[380px] overflow-y-auto overscroll-contain">
            {SYMBOL_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <div className="sticky top-0 z-10 border-b border-border/50 bg-popover px-3 py-1 text-[length:var(--font-size-12)] font-medium text-muted-foreground">
                  {cat.label}
                </div>
                <div className="grid grid-cols-8 gap-px px-1.5 py-1.5">
                  {cat.symbols.map((sym) => {
                    const html = getSymbolHtml(sym);
                    return (
                      <button
                        key={sym.command}
                        type="button"
                        className="flex h-9 items-center justify-center rounded-sm transition-colors hover:bg-accent"
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

      <AppMenu>
        <Hint label={t("modes.texworkspace.insertEnv")}>
          <AppMenuTrigger asChild>
            <button type="button" className={TOOL_BTN}>
              <BookOpenIcon className="size-3.5" />
            </button>
          </AppMenuTrigger>
        </Hint>
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
