import { useEffect, useRef } from "react";
import { useCompileStore } from "@/stores/compile-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { useTexworkspace } from "@/modes/texworkspace-mode/use-texworkspace";
import { Group, Panel, Separator } from "react-resizable-panels";
import { RightPane } from "@/components/layout/right-pane";
import { PdfPreview } from "@/components/modules/preview";
import { CompileProblemsPanel } from "@/modes/texworkspace-mode/compile-problems-panel";

const SEP = "w-px bg-border hover:bg-foreground/30 transition-colors outline-none relative after:absolute after:inset-y-0 after:-left-1 after:-right-1";

interface RightMainAreaProps {
  tabs: RightTab[];
  activeTabId: string | null;
}

export function RightMainArea({ tabs, activeTabId }: RightMainAreaProps) {
  const { isActive, viewMode, switchToFile } = useTexworkspace();
  const pdfRevision = useCompileStore((s) => s.pdfRevision);
  const problemsOpen = useLayoutStore((s) => s.texworkspaceProblemsOpen);

  const previewSlot = problemsOpen ? <CompileProblemsPanel /> : <PdfPreview />;

  // Compile completion → switch to Texworkspace tab
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

  if (!isActive) {
    return (
      <div className="flex flex-col h-full min-w-0">
        <div className="relative flex-1 min-h-0">
          <RightPane tabs={tabs} activeTabId={activeTabId} />
        </div>
      </div>
    );
  }

  const wrapper = (children: React.ReactNode) => (
    <div className="flex flex-col h-full min-w-0">
      <div className="relative flex-1 min-h-0">{children}</div>
    </div>
  );

  if (viewMode === "tex") return wrapper(<RightPane tabs={tabs} activeTabId={activeTabId} />);
  if (viewMode === "pdf") return wrapper(previewSlot);

  // split — PDF/problems left, TeX right
  return wrapper(
    <Group orientation="horizontal" className="flex-1 min-h-0" resizeTargetMinimumSize={{ fine: 5, coarse: 5 }}>
      <Panel id="pdf" minSize={150} defaultSize={60}>
        {previewSlot}
      </Panel>
      <Separator id="sep-pdf" className={SEP} />
      <Panel id="editor" minSize={150} defaultSize={40}>
        <RightPane tabs={tabs} activeTabId={activeTabId} />
      </Panel>
    </Group>,
  );
}
