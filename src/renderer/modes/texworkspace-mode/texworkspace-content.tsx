import { useMemo } from "react";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { NoFileOpen } from "@/components/modules/editor/no-file-open";
import { TabContext, type TabContextValue } from "@/lib/workspace/tab-context";
import { resolveViewer, wrapTabContext } from "@/lib/workspace/mode-utils";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { useLayoutStore } from "@/stores/layout-store";
import { Button } from "@/components/ui/button";
import { FileTextIcon } from "lucide-react";
import { TexworkspaceToolbar } from "./texworkspace-toolbar";

export function TexworkspaceContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const manuscriptConfig = useWorkspaceConfigStore((s) => s.manuscriptConfig);

  const ctx: TabContextValue = useMemo(
    () => ({ tab, isActive }),
    [tab, isActive],
  );

  // Block when no manuscript is configured — TeX workspace requires it
  if (!manuscriptConfig) {
    return wrapTabContext(
      ctx,
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <FileTextIcon className="size-12 text-muted-foreground/20" />
        <div className="space-y-1.5 text-center">
          <p className="text-[length:var(--font-placeholder)] text-muted-foreground font-medium">
            No manuscript folder configured
          </p>
          <p className="text-sm text-muted-foreground/60 max-w-[320px]">
            A manuscript folder is required for TeX editing, PDF preview,
            outline navigation, and compilation. Configure one in your
            workspace settings to get started.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            useLayoutStore.getState().setLeftSidebarView("settings");
            useLayoutStore.getState().setSettingsCategory("workspace");
          }}
        >
          Open Workspace Settings
        </Button>
      </div>,
    );
  }

  if (tab.isInitial || !tab.filePath) {
    return wrapTabContext(ctx, <NoFileOpen />);
  }
  return wrapTabContext(ctx, resolveViewer(tab.filePath));
}

export function TexworkspaceToolbarWrapper({ tab }: { tab: RightTab }) {
  const manuscriptConfig = useWorkspaceConfigStore((s) => s.manuscriptConfig);
  // Block compile when no manuscript is configured
  const compileFile = manuscriptConfig ? (tab.fileId ?? null) : null;
  return <TexworkspaceToolbar compileFile={compileFile} />;
}
