import { useRef, type ReactNode } from "react";
import { ChatModeSelect } from "./chat-mode-select";
import { ModelThoughtSelect } from "./model-thought-select";
import { PermissionModeSelect } from "./permission-mode-select";
import { useChatStore } from "@/stores/chat-store";
import { useComposerCompact } from "./use-composer-compact";
import { cn } from "@/lib/utils";

function ToolbarDivider() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />;
}

interface ComposerToolbarProps {
  addMenu: ReactNode;
  sendControls: ReactNode;
}

export function ComposerToolbar({ addMenu, sendControls }: ComposerToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const compact = useComposerCompact(toolbarRef);
  const chatMode = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.chatMode ?? "agent",
  );
  const isExpertTeam = chatMode === "expert-team";

  return (
    <div
      ref={toolbarRef}
      className="flex items-center justify-between gap-1 px-2 pb-1.5 min-w-0"
    >
      <div className={cn("flex min-w-0 flex-1 items-center gap-0.5")}>
        {addMenu}
        <ChatModeSelect compact={compact} />
        {!isExpertTeam && (
          <>
            <ToolbarDivider />
            <ModelThoughtSelect compact={compact} />
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <PermissionModeSelect compact={compact} />
        {sendControls}
      </div>
    </div>
  );
}
