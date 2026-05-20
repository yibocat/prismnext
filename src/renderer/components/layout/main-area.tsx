import { useLayoutStore } from "@/stores/layout-store";
import { TabBar } from "@/components/workspace/tab-bar";
import { LatexEditor } from "@/components/workspace/latex-editor";
import { AiFab } from "@/components/workspace/ai-fab";
import { MessageSquareIcon, FilePlusIcon } from "lucide-react";

function ManuscriptWorkspace() {
  const editorTabs = useLayoutStore((s) => s.editorTabs);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <TabBar />
      <div className="relative flex-1 min-h-0">
        {editorTabs.length > 0 ? (
          <>
            <LatexEditor />
            <AiFab />
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
              <p className="mt-1 text-[11px] text-muted-foreground/60">
                Open a file from the sidebar to start editing
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
        <MessageSquareIcon className="size-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Chat</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Start a conversation with your research assistant.
        </p>
      </div>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <p className="text-center text-[13px] text-muted-foreground">
        {label}
        <span className="mt-1 block text-[11px] opacity-60">coming soon</span>
      </p>
    </div>
  );
}

export function MainArea() {
  const activeMode = useLayoutStore((s) => s.activeMode);

  return (
    <main className="flex flex-1 flex-col min-h-0 bg-background">
      {activeMode === "manuscript" && <ManuscriptWorkspace />}
      {activeMode === "chat" && <ChatPlaceholder />}
      {activeMode === "vault" && <Placeholder label="Vault — Markdown Notes" />}
      {activeMode === "zotero" && <Placeholder label="Zotero — Literature Library" />}
      {activeMode === "code" && <Placeholder label="Code Editor" />}
    </main>
  );
}
