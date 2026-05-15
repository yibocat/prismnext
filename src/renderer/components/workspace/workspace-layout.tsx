import { useEffect } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Sidebar } from "./sidebar";
import { LatexEditor } from "./editor/latex-editor";
import { useDocumentStore } from "@/stores/document-store";

function PdfPreviewPlaceholder() {
  return (
    <div className="flex h-full flex-col">
      {/* Header for drag region */}
      <div className="drag-region flex h-[calc(36px+var(--titlebar-height))] shrink-0 items-center justify-center border-border border-b bg-muted/30 pt-[var(--titlebar-height)]">
        <span className="font-medium text-muted-foreground text-xs">PDF Preview</span>
      </div>
      <div className="flex flex-1 items-center justify-center bg-muted/10">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">PDF Preview</p>
          <p className="mt-1 text-muted-foreground/60 text-xs">
            Compile with Cmd+Enter
          </p>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceLayout() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  // Update window title when project changes
  useEffect(() => {
    if (projectRoot) {
      const projectName = projectRoot.split(/[/\\]/).pop() || "Project";
      window.electronAPI.windowSetTitle(`Prism - ${projectName}`);
    }
  }, [projectRoot]);

  return (
    <Group id="workspace" orientation="horizontal" className="h-full">
      <Panel id="sidebar" defaultSize="18%" minSize="12%" maxSize="30%">
        <Sidebar />
      </Panel>

      <Separator id="sidebar-sep" className="bg-border hover:bg-ring" />

      <Panel id="editor" defaultSize="41%" minSize="25%">
        <LatexEditor />
      </Panel>

      <Separator id="preview-sep" className="bg-border hover:bg-ring" />

      <Panel id="preview" defaultSize="41%" minSize="25%">
        <PdfPreviewPlaceholder />
      </Panel>
    </Group>
  );
}
