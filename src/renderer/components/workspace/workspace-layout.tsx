import { useEffect } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Sidebar } from "./sidebar";
import { LatexEditor } from "./editor/latex-editor";
import { PdfPreview } from "./preview/pdf-preview";
import { useDocumentStore } from "@/stores/document-store";

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
        <PdfPreview />
      </Panel>
    </Group>
  );
}
