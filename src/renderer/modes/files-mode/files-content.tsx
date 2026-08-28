import { useEffect, useMemo } from "react";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { type TabContextValue } from "@/lib/workspace/tab-context";
import { NoFileOpen } from "@/components/modules/editor/no-file-open";
import { MarkdownPreview, resolveViewer, wrapTabContext } from "@/lib/workspace/mode-utils";
import { FileCompileLayout } from "@/lib/compile/file-compile-layout";
import { classifyCompileTab, isCompileLayoutTab } from "@/lib/compile/classify-compile-tab";
import { resolveCompilePreviewOpen } from "@/lib/compile/compile-split";
import { PdfPreview } from "@/components/modules/preview";
import { compileEngineFromRelPath } from "@shared/compile/artifact-key";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { isStandaloneTexDocument, resolveCompileTarget } from "@/lib/tex/resolve-tex-root";
import { resolveTypstRootFromBuffers } from "@/lib/typst/resolve-typst-root";
import { TypstLivePreview } from "@/lib/typst/typst-live-preview";

export function FilesContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const ctx: TabContextValue = useMemo(
    () => ({ tab, isActive }),
    [tab, isActive],
  );
  const files = useDocumentStore((s) => s.files);
  const getAsset = useDocumentStore((s) => s.getAsset);
  const openedContents = useDocumentStore((s) => s.openedContents);
  const manuscriptDir = useWorkspaceConfigStore((s) => s.manuscriptConfig?.dir ?? null);
  const mainFilePin = useWorkspaceConfigStore((s) => s.manuscriptConfig?.mainFile ?? null);
  const previewOpenByFileId = useLayoutStore((s) => s.compilePreviewOpenByFileId);
  const typstPreviewKindByFileId = useLayoutStore((s) => s.typstPreviewKindByFileId);
  const setCompilePreviewOpen = useLayoutStore((s) => s.setCompilePreviewOpen);

  useEffect(() => {
    if (!isActive || tab.kind !== "file" || !tab.fileId) return;
    useDocumentStore.getState().setActiveFile(tab.fileId);
  }, [isActive, tab]);

  if (tab.kind !== "file" || tab.isInitial || !tab.filePath) {
    return wrapTabContext(ctx, <NoFileOpen />);
  }
  if (tab.viewMode === "preview") {
    if (!isActive) return null;
    return wrapTabContext(ctx, <MarkdownPreview />);
  }

  const fileRel = tab.filePath;
  const fileId = tab.fileId ?? fileRel;
  const previewOpen = resolveCompilePreviewOpen(previewOpenByFileId[fileId], fileRel);

  const typstRootRel =
    compileEngineFromRelPath(fileRel) === "typst"
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

  const content = tab.fileId
    ? (openedContents.get(tab.fileId)?.content ?? getAsset(tab.fileId) ?? "")
    : "";
  const resolved = resolveCompileTarget(tab.fileId || fileRel, files, getAsset);
  const cls = classifyCompileTab({
    fileRel,
    manuscriptDir,
    content,
    isStandaloneTex: isStandaloneTexDocument,
    latexRootRel: resolved?.targetPath ?? null,
    typstRootRel,
  });

  if (isCompileLayoutTab(cls)) {
    const compileRoot =
      cls.engine === "typst" ? (typstRootRel ?? fileRel) : (resolved?.targetPath ?? fileRel);
    const typstKind = typstPreviewKindByFileId[fileId] ?? "live";
    const showTypstLive = cls.engine === "typst" && typstKind !== "pdf";
    return wrapTabContext(
      ctx,
      <FileCompileLayout
        editor={resolveViewer(fileRel)}
        preview={
          showTypstLive ? (
            <TypstLivePreview compileRootRel={compileRoot} enabled={previewOpen && isActive} />
          ) : (
            <PdfPreview sourceMode="compile" />
          )
        }
        previewOpen={previewOpen}
        onPreviewOpenChange={(open) => setCompilePreviewOpen(fileId, open)}
        compileRoot={compileRoot}
        skipPreviewPdfCompile={showTypstLive}
      />,
    );
  }

  return wrapTabContext(ctx, resolveViewer(tab.filePath));
}
