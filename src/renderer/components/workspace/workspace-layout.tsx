import { Group, Panel, Separator } from "react-resizable-panels";
import { Sidebar } from "./sidebar";
import { LatexEditor } from "./editor/latex-editor";
import { useDocumentStore } from "@/stores/document-store";

function PdfPreviewPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center bg-muted/10">
      <div className="text-center">
        <p className="text-muted-foreground text-sm">PDF Preview</p>
        <p className="mt-1 text-muted-foreground/60 text-xs">
          Compile with Cmd+Enter
        </p>
      </div>
    </div>
  );
}

export function WorkspaceLayout() {
  const initialized = useDocumentStore((s) => s.initialized);

  if (!initialized) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    );
  }

  return (
    <Group orientation="horizontal" className="h-full">
      <Panel defaultSize={18} minSize={12} maxSize={30}>
        <Sidebar />
      </Panel>

      <Separator className="w-[3px] cursor-col-resize rounded bg-border transition-colors hover:bg-ring" />

      <Panel defaultSize={41} minSize={25}>
        <LatexEditor />
      </Panel>

      <Separator className="w-[3px] cursor-col-resize rounded bg-border transition-colors hover:bg-ring" />

      <Panel defaultSize={41} minSize={25}>
        <PdfPreviewPlaceholder />
      </Panel>
    </Group>
  );
}
