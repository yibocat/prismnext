import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import type { RightTab } from "@/lib/workspace/mode-registry";
import type { LiteraturePaper } from "@/types/electron.d";
import { RightPane } from "@/components/layout/right-pane";
import { WorkspaceSplit } from "@/components/layout/workspace-split";
import { LiteratureReader } from "@/modes/literature-mode/literature-reader";
import { LiteratureNotesPane } from "@/modes/literature-mode/literature-notes-pane";

interface RightMainAreaProps {
  tabs: RightTab[];
  activeTabId: string | null;
}

function mainWrapper(children: React.ReactNode) {
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="relative min-h-0 flex-1">{children}</div>
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

function KeepAliveLayer({
  visible,
  children,
  className,
}: {
  visible: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-full min-h-0 bg-background",
        visible
          ? "relative z-0"
          : "pointer-events-none invisible absolute inset-0 z-[-1]",
        className,
      )}
      aria-hidden={!visible}
    >
      {children}
    </div>
  );
}

export function RightMainArea({ tabs, activeTabId }: RightMainAreaProps) {
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
                "absolute inset-0 z-10 bg-background",
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

  const otherPaneVisible = !showLiteratureReader;
  const literatureLoading =
    activeTab?.kind === "literature" &&
    Boolean(activeTab.literaturePaperId) &&
    Boolean(projectRoot) &&
    !literaturePaper;

  return mainWrapper(
    <div data-surface="content" className="relative isolate h-full min-h-0">
      {literatureShells}

      <KeepAliveLayer visible={otherPaneVisible && !literatureLoading}>
        <RightPane tabs={tabs} activeTabId={activeTabId} />
      </KeepAliveLayer>

      {literatureLoading ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background text-muted-foreground text-sm">
          Loading paper…
        </div>
      ) : null}
    </div>,
  );
}
