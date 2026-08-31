import { useEffect, useMemo, useState } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { useTranslation } from "react-i18next";
import { openUrlInBrowser } from "@/lib/browser-link";
import { AlertCircleIcon, Columns2Icon, FileDownIcon, FileTextIcon, GlobeIcon, Loader2Icon, PlayIcon, ZapIcon, ZapOffIcon } from "lucide-react";
import { MarkdownToolbar } from "@/components/modules/editor/toolbars/markdown-toolbar";
import { LanguageLabel } from "@/components/modules/editor/toolbars/language-label";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { classifyCompileTab, isCompileLayoutTab } from "@/lib/compile/classify-compile-tab";
import { paperKeyFromMainFile } from "@/lib/compile/compile-artifact";
import { problemsFromDiagnostics } from "@/lib/compile/compile-problems-strip";
import { resolveCompilePreviewOpen } from "@/lib/compile/compile-split";
import { compileArtifactCacheKey, compileEngineFromRelPath } from "@shared/compile/artifact-key";
import { compileCurrentDocument, useCompileStore } from "@/stores/compile-store";
import { compileTypstPdf } from "@/stores/typst-live-store";
import { TypstExportDialog } from "./typst-export-dialog";
import { useLayoutStore } from "@/stores/layout-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { isStandaloneTexDocument, resolveCompileTarget } from "@/lib/tex/resolve-tex-root";
import { resolveTypstRootFromBuffers } from "@/lib/typst/resolve-typst-root";

interface FileToolbarProps {
  tab: RightTab;
}

const TOOL_BTN =
  "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40";

function HtmlPreviewButton({ filePath }: { filePath: string }) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const handlePreview = () => {
    if (!projectRoot) return;
    const absPath = `${projectRoot}/${filePath}`;
    const fileUrl = `file://${encodeURI(absPath)}`;
    openUrlInBrowser(fileUrl);
  };

  return (
    <Hint label={t("modes.files.previewInBrowser")}>
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        onClick={handlePreview}
      >
        <GlobeIcon className="size-3.5" />
      </button>
    </Hint>
  );
}

function FilesCompileToolbar({ filePath, fileId }: { filePath: string; fileId?: string }) {
  const { t } = useTranslation();
  const fileRel = filePath;
  const previewKey = fileId ?? fileRel;
  const isCompiling = useCompileStore((s) => s.isCompiling);
  const autoCompile = useCompileStore((s) => s.autoCompile);
  const toggleAutoCompile = useCompileStore((s) => s.toggleAutoCompile);
  const files = useDocumentStore((s) => s.files);
  const getAsset = useDocumentStore((s) => s.getAsset);
  const manuscriptDir = useWorkspaceConfigStore((s) => s.manuscriptConfig?.dir ?? null);
  const mainFilePin = useWorkspaceConfigStore((s) => s.manuscriptConfig?.mainFile ?? null);
  const previewOpen = useLayoutStore((s) =>
    resolveCompilePreviewOpen(s.compilePreviewOpenByFileId[previewKey], fileRel),
  );
  const typstKind = useLayoutStore((s) => s.typstPreviewKindByFileId[previewKey] ?? "live");
  const errorPaneOpen = useLayoutStore((s) => s.compileErrorPaneByFileId[previewKey] ?? false);
  const setCompilePreviewOpen = useLayoutStore((s) => s.setCompilePreviewOpen);
  const setTypstPreviewKind = useLayoutStore((s) => s.setTypstPreviewKind);
  const setCompileErrorPane = useLayoutStore((s) => s.setCompileErrorPane);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const isTypst = compileEngineFromRelPath(fileRel) === "typst";
  const [exportOpen, setExportOpen] = useState(false);

  const cls = useMemo(() => {
    const engine = compileEngineFromRelPath(fileRel);
    const resolved = engine === "latex"
      ? resolveCompileTarget(fileId || fileRel, files, getAsset)
      : null;
    const typstRootRel = engine === "typst"
      ? (resolveTypstRootFromBuffers({
          files,
          getContent: (rel) => {
            const f = files.find((x) => x.relativePath.replace(/\\/g, "/") === rel.replace(/\\/g, "/"));
            return f ? getAsset(f.id) : "";
          },
          manuscriptDir,
          mainFilePin,
          hintRel: fileRel,
        }) ?? fileRel)
      : null;
    return {
      cls: classifyCompileTab({
        fileRel,
        manuscriptDir,
        content: getAsset(fileId || fileRel),
        isStandaloneTex: isStandaloneTexDocument,
        latexRootRel: resolved?.targetPath ?? null,
        typstRootRel,
      }),
      compileRoot: engine === "typst" ? (typstRootRel ?? fileRel) : (resolved?.targetPath ?? fileRel),
    };
  }, [fileRel, files, getAsset, manuscriptDir, mainFilePin, fileId]);

  const artifactKey = projectRoot
    ? paperKeyFromMainFile(projectRoot, cls.compileRoot)
    : null;
  const cacheKey = artifactKey ? compileArtifactCacheKey(artifactKey) : "";
  const diag = useCompileStore((s) => (cacheKey ? s.diagnosticsByKey[cacheKey] : undefined));
  const problems = useMemo(
    () => problemsFromDiagnostics(diag, isTypst ? "typst" : "latex"),
    [diag, isTypst],
  );

  useEffect(() => {
    if (problems.length === 0 && errorPaneOpen) {
      setCompileErrorPane(previewKey, false);
    }
  }, [problems.length, errorPaneOpen, previewKey, setCompileErrorPane]);

  if (!isCompileLayoutTab(cls.cls)) return null;

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {cls.cls.kind === "paper-child" ? (
        <span className="mr-1 max-w-[12rem] truncate text-[length:var(--font-size-11)] text-muted-foreground">
          {t("modes.files.compileRoot", { root: cls.compileRoot })}
        </span>
      ) : null}
      <Hint
        label={
          cls.cls.kind === "standalone"
            ? t("modes.files.compileThisFile")
            : t("modes.files.compileDocument")
        }
        shortcutId="product.compile"
      >
        <button
          type="button"
          className={cn(TOOL_BTN, !isCompiling && "text-primary hover:text-primary")}
          onClick={() => {
            if (fileId) useDocumentStore.getState().setActiveFile(fileId);
            if (isTypst) void compileTypstPdf(cls.compileRoot);
            else void compileCurrentDocument();
          }}
          disabled={isCompiling}
        >
          {isCompiling ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <PlayIcon className="size-3.5" />
          )}
        </button>
      </Hint>
      {problems.length > 0 ? (
        <Hint label={errorPaneOpen ? t("modes.files.hideProblems") : t("modes.files.showProblems")}>
          <button
            type="button"
            className={cn(
              TOOL_BTN,
              errorPaneOpen ? "bg-muted text-destructive" : "text-destructive hover:text-destructive",
            )}
            onClick={() => {
              const next = !errorPaneOpen;
              setCompileErrorPane(previewKey, next);
              if (next) setCompilePreviewOpen(previewKey, true);
            }}
          >
            <AlertCircleIcon className="size-3.5" />
          </button>
        </Hint>
      ) : null}
      {isTypst ? null : (
      <Hint label={autoCompile ? t("modes.files.autoCompileOn") : t("modes.files.autoCompileOff")}>
        <button type="button" className={TOOL_BTN} onClick={toggleAutoCompile}>
          {autoCompile ? (
            <ZapIcon className="size-3.5 text-warning" />
          ) : (
            <ZapOffIcon className="size-3.5" />
          )}
        </button>
      </Hint>
      )}
      {isTypst ? (
        <>
          <Hint label={t("modes.files.typstExport")}>
            <button type="button" className={TOOL_BTN} onClick={() => setExportOpen(true)}>
              <FileDownIcon className="size-3.5" />
            </button>
          </Hint>
          <TypstExportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            compileRoot={cls.compileRoot}
            fileId={fileId}
          />
        </>
      ) : null}
      <Hint
        label={
          isTypst
            ? (previewOpen ? t("modes.files.typstHideLive") : t("modes.files.typstShowLive"))
            : (previewOpen ? t("modes.files.hidePdf") : t("modes.files.showPdf"))
        }
      >
        <button
          type="button"
          className={cn(TOOL_BTN, previewOpen && typstKind !== "pdf" && "bg-muted text-foreground")}
          onClick={() => {
            if (isTypst) setTypstPreviewKind(previewKey, "live");
            setCompilePreviewOpen(previewKey, isTypst ? !(previewOpen && typstKind === "live") : !previewOpen);
          }}
        >
          {previewOpen && (!isTypst || typstKind === "live") ? (
            <Columns2Icon className="size-3.5" />
          ) : (
            <FileTextIcon className="size-3.5" />
          )}
        </button>
      </Hint>
      {isTypst ? (
        <Hint label={t("modes.files.typstPdfPreview")}>
          <button
            type="button"
            className={cn(TOOL_BTN, previewOpen && typstKind === "pdf" && "bg-muted text-foreground")}
            onClick={() => {
              const next = typstKind === "pdf" ? "live" : "pdf";
              setTypstPreviewKind(previewKey, next);
              setCompilePreviewOpen(previewKey, true);
              if (fileId) useDocumentStore.getState().setActiveFile(fileId);
              if (next === "pdf") {
                void compileTypstPdf(cls.compileRoot, { skipIfCached: true });
              }
            }}
          >
            <span className="text-[10px] font-medium leading-none">PDF</span>
          </button>
        </Hint>
      ) : null}
    </div>
  );
}

/**
 * Dispatches toolbar content based on file extension.
 * Follows the project pattern: mode-level dispatch (right-area.tsx)
 * → file-type dispatch (this component).
 */
export function FileToolbar({ tab }: FileToolbarProps) {
  const filePath = tab.kind === "file" ? tab.filePath : undefined;
  const ext = filePath?.slice(filePath.lastIndexOf(".")).toLowerCase() ?? "";
  const fileId = tab.kind === "file" ? tab.fileId : undefined;

  switch (ext) {
    case ".md":
    case ".mdx":
      return <MarkdownToolbar />;

    case ".html":
    case ".htm":
      return filePath ? <HtmlPreviewButton filePath={filePath} /> : null;

    case ".tex":
    case ".ltx":
    case ".typ":
      return filePath ? <FilesCompileToolbar filePath={filePath} fileId={fileId} /> : null;

    default:
      return <LanguageLabel ext={ext} />;
  }
}
