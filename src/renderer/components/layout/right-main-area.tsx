import { useEffect, useRef, type ReactNode } from "react";
import { useCompileStore } from "@/stores/compile-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { useTexworkspace } from "@/modes/texworkspace-mode/use-texworkspace";
import { RightPane } from "@/components/layout/right-pane";
import { WorkspaceSplit } from "@/components/layout/workspace-split";
import { PdfPreview } from "@/components/modules/preview";
import { CompileProblemsPanel } from "@/modes/texworkspace-mode/compile-problems-panel";
import { LiteratureReader } from "@/modes/literature-mode/literature-reader";
import { LiteratureNotesPane } from "@/modes/literature-mode/literature-notes-pane";

interface RightMainAreaProps {
  tabs: RightTab[];
  activeTabId: string | null;
}

function mainWrapper(children: React.ReactNode) {
  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="relative flex-1 min-h-0">{children}</div>
    </div>
  );
}

export function RightMainArea({ tabs, activeTabId }: RightMainAreaProps) {
  const { isActive: texActive, viewMode: texViewMode, switchToFile } = useTexworkspace();
  const pdfRevision = useCompileStore((s) => s.pdfRevision);
  const problemsOpen = useLayoutStore((s) => s.texworkspaceProblemsOpen);

  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const papers = useLiteratureStore((s) => s.papers);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const literaturePaper =
    activeTab?.kind === "literature" && activeTab.literaturePaperId
      ? (papers.find((p) => p.id === activeTab.literaturePaperId) ?? null)
      : null;
  const literatureReaderActive = Boolean(literaturePaper && projectRoot);
  const literatureNotesOpen = useLiteratureReaderStore(
    (s) => (literaturePaper ? (s.notesPaneOpenByPaper[literaturePaper.id] ?? false) : false),
  );

  const previewSlot = problemsOpen ? <CompileProblemsPanel /> : <PdfPreview />;

  const lastRevision = useRef(pdfRevision);
  useEffect(() => {
    if (pdfRevision > 0 && pdfRevision !== lastRevision.current) {
      lastRevision.current = pdfRevision;
      const state = useRightPanelStore.getState();
      const current = state.tabs.find((t) => t.id === state.activeTabId);
      if (current?.kind === "file" && current.fileId?.endsWith(".tex") && current.filePath && current.fileId) {
        switchToFile(current.fileId, current.filePath, current.title);
      }
    }
  }, [pdfRevision, switchToFile]);

  if (activeTab?.kind === "literature" && activeTab.literaturePaperId && projectRoot && !literaturePaper) {
    return mainWrapper(
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading paper…
      </div>,
    );
  }

  if (literatureReaderActive && literaturePaper && projectRoot && activeTab) {
    const reader = <LiteratureReader projectRoot={projectRoot} paper={literaturePaper} />;
    const notes = (
      <LiteratureNotesPane projectRoot={projectRoot} paper={literaturePaper} tab={activeTab} />
    );

    if (!literatureNotesOpen) return mainWrapper(reader);

    return mainWrapper(
      <WorkspaceSplit
        left={reader}
        right={notes}
        leftId="lit-pdf"
        rightId="lit-notes"
        defaultLeft={55}
      />,
    );
  }

  if (!texActive) {
    return mainWrapper(<RightPane tabs={tabs} activeTabId={activeTabId} />);
  }

  if (texViewMode === "tex") return mainWrapper(<RightPane tabs={tabs} activeTabId={activeTabId} />);
  if (texViewMode === "pdf") return mainWrapper(previewSlot);

  return mainWrapper(
    <WorkspaceSplit
      left={previewSlot}
      right={<RightPane tabs={tabs} activeTabId={activeTabId} />}
      leftId="pdf"
      rightId="editor"
      defaultLeft={60}
    />,
  );
}
