import { useRef, type ReactNode } from "react";
import { ModelThoughtSelect } from "./model-thought-select";
import { PermissionModeSelect } from "./permission-mode-select";
import { IntensiveReadingListButton, useIntensiveReadingCount } from "../intensive-reading-list-button";
import { useComposerCompact } from "./use-composer-compact";
import { cn } from "@/lib/utils";

function ToolbarDivider() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />;
}

interface ComposerToolbarProps {
  addMenu: ReactNode;
  sendControls: ReactNode;
  /**
   * Capsule (RightArea maximized): put model select to the left of send.
   * Panel (left chat): keep model on the left with add menu.
   */
  modelBesideSend?: boolean;
}

export function ComposerToolbar({
  addMenu,
  sendControls,
  modelBesideSend = false,
}: ComposerToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const compact = useComposerCompact(toolbarRef);
  const intensiveCount = useIntensiveReadingCount();

  return (
    <div
      ref={toolbarRef}
      className="flex items-center justify-between gap-1 px-2 pb-1.5 min-w-0"
    >
      <div className={cn("flex min-w-0 flex-1 items-center gap-0.5")}>
        {addMenu}
        {!modelBesideSend ? <ModelThoughtSelect compact={compact} /> : null}
        {intensiveCount > 0 ? (
          <>
            <ToolbarDivider />
            <IntensiveReadingListButton compact={compact} variant="panel" />
          </>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <PermissionModeSelect compact={compact} />
        {modelBesideSend ? (
          <ModelThoughtSelect presentation="capsule" />
        ) : null}
        {sendControls}
      </div>
    </div>
  );
}
