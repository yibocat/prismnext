import { useLayoutStore } from "@/stores/layout-store";
import { TabBar } from "@/components/workspace/tab-bar";
import { LatexEditor } from "@/components/workspace/latex-editor";
import { AiFab } from "@/components/workspace/ai-fab";
import { FilePlusIcon } from "lucide-react";

export function RightMainArea() {
  const editorTabs = useLayoutStore((s) => s.modeEditorTabs[s.activeMode]);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);

  return (
    <div className="flex flex-1 flex-col min-w-[150px]">
      <TabBar />
      <div className="relative flex-1 min-h-0">
        {editorTabs.length > 0 ? (
          <>
            <LatexEditor />
            {/* FAB only when Chat is hidden (editor maximized) */}
            {editorMaximized && <AiFab />}
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-muted mx-auto">
                <FilePlusIcon className="size-7 text-muted-foreground" />
              </div>
              <p className="mt-3 text-[13px] text-muted-foreground">
                No open files
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
