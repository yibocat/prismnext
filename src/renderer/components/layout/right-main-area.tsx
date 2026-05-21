import { useLayoutStore } from "@/stores/layout-store";
import { TabBar } from "@/components/workspace/tab-bar";
import { LatexEditor } from "@/components/workspace/latex-editor";
import { PdfPreview } from "@/components/workspace/pdf-preview";
import { AiFab } from "@/components/workspace/ai-fab";
import { FilePlusIcon } from "lucide-react";

export function RightMainArea() {
  const activeMode = useLayoutStore((s) => s.activeMode);
  const editorTabs = useLayoutStore((s) => s.modeEditorTabs[activeMode]);
  const activeEditorTab = useLayoutStore((s) => s.modeActiveEditorTab[activeMode]);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);

  if (editorTabs.length === 0) {
    return (
      <div className="flex flex-1 flex-col min-w-[150px]">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted mx-auto">
              <FilePlusIcon className="size-7 text-muted-foreground" />
            </div>
            <p className="mt-3 text-[13px] text-muted-foreground">No open files</p>
          </div>
        </div>
      </div>
    );
  }

  const activeTab = editorTabs.find((t) => t.id === activeEditorTab);

  return (
    <div className="flex flex-1 flex-col min-w-[150px]">
      <TabBar />
      <div className="relative flex-1 min-h-0">
        {activeTab?.type === "pdf" ? <PdfPreview /> : <LatexEditor />}
        {editorMaximized && <AiFab />}
      </div>
    </div>
  );
}
