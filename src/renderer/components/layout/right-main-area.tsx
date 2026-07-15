import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useCompileStore } from "@/stores/compile-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import type { RightTab } from "@/lib/workspace/mode-registry";
import type { LiteraturePaper } from "@/types/electron.d";
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

function LiteratureReaderShell({
  projectRoot,
  paper,
  tab,
  notesOpen,
}: {
  projectRoot: string;
  paper: LiteraturePaper;
  tab: RightTab;
  notesOpen: boolean;
}) {
  const setNotesPaneOpen = useLiteratureReaderStore((s) => s.setNotesPaneOpen);

  return (
    <WorkspaceSplit
      left={<LiteratureReader projectRoot={projectRoot} paper={paper} />}
      right={<LiteratureNotesPane projectRoot={projectRoot} paper={paper} tab={tab} />}
      leftId="lit-pdf"
      rightId="lit-notes"
      defaultLeft={55}
      layoutKey={`literature:reader-notes:${paper.id}`}
      rightCollapsed={!notesOpen}
      onRightCollapsedChange={(collapsed) => setNotesPaneOpen(paper.id, !collapsed)}
    />
  );
}

function withLiteratureKeepAlive(
  content: ReactNode,
  shells: ReactNode | null,
  readerVisible: boolean,
): ReactNode {
  if (!shells) return content;
  return (
    <div className="relative h-full min-h-0">
      {shells}
      {!readerVisible ? (
        <div className="relative z-0 h-full min-h-0">{content}</div>
      ) : null}
    </div>
  );
}

export function RightMainArea({ tabs, activeTabId }: RightMainAreaProps) {
  const { isActive: texActive, viewMode: texViewMode, switchToFile } = useTexworkspace();
  const pdfRevision = useCompileStore((s) => s.pdfRevision);
  const problemsOpen = useLayoutStore((s) => s.texworkspaceProblemsOpen);

  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const papers = useLiteratureStore((s) => s.papers);
  const notesPaneOpenByPaper = useLiteratureReaderStore((s) => s.notesPaneOpenByPaper);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activePaperId =
    activeTab?.kind === "literature" ? (activeTab.literaturePaperId ?? null) : null;
  const literaturePaper = activePaperId
    ? (papers.find((p) => p.id === activePaperId) ?? null)
    : null;

  const openLiteraturePaperTabs = useMemo(
    () =>
      tabs.filter(
        (t): t is RightTab & { literaturePaperId: string } =>
          t.kind === "literature" && Boolean(t.literaturePaperId),
      ),
    [tabs],
  );

  const showLiteratureReader = Boolean(
    activeTab?.kind === "literature" && literaturePaper && projectRoot && activeTab,
  );

  const literatureShells =
    projectRoot && openLiteraturePaperTabs.length > 0 ? (
      <>
        {openLiteraturePaperTabs.map((litTab) => {
          const paper = papers.find((p) => p.id === litTab.literaturePaperId);
          if (!paper) return null;
          const isVisible = showLiteratureReader && litTab.literaturePaperId === activePaperId;
          return (
            <div
              key={paper.id}
              className={cn(
                "absolute inset-0 z-10",
                !isVisible && "invisible pointer-events-none",
              )}
              aria-hidden={!isVisible}
            >
              <LiteratureReaderShell
                projectRoot={projectRoot}
                paper={paper}
                tab={litTab}
                notesOpen={notesPaneOpenByPaper[paper.id] ?? false}
              />
            </div>
          );
        })}
      </>
    ) : null;

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

  if (activeTab?.kind === "literature" && projectRoot && activeTab) {
    return mainWrapper(
      withLiteratureKeepAlive(
        <RightPane tabs={tabs} activeTabId={activeTabId} />,
        literatureShells,
        showLiteratureReader,
      ),
    );
  }

  if (!texActive) {
    return mainWrapper(
      withLiteratureKeepAlive(
        <RightPane tabs={tabs} activeTabId={activeTabId} />,
        literatureShells,
        false,
      ),
    );
  }

  if (texViewMode === "tex") {
    return mainWrapper(
      withLiteratureKeepAlive(
        <RightPane tabs={tabs} activeTabId={activeTabId} />,
        literatureShells,
        false,
      ),
    );
  }

  if (texViewMode === "pdf") {
    return mainWrapper(
      withLiteratureKeepAlive(previewSlot, literatureShells, false),
    );
  }

  return mainWrapper(
    withLiteratureKeepAlive(
      <WorkspaceSplit
        left={previewSlot}
        right={<RightPane tabs={tabs} activeTabId={activeTabId} />}
        leftId="pdf"
        rightId="editor"
        defaultLeft={60}
      />,
      literatureShells,
      false,
    ),
  );
}
