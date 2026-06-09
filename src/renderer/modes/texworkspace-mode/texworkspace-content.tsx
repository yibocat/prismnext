import { useMemo } from "react";
import type { RightTab } from "@/lib/mode-registry";
import { NoFileOpen } from "@/components/modules/editor/no-file-open";
import { TabContext, type TabContextValue } from "@/lib/tab-context";
import { resolveViewer, wrapTabContext } from "@/lib/mode-utils";
import { TexworkspaceToolbar } from "./texworkspace-toolbar";

export function TexworkspaceContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const ctx: TabContextValue = useMemo(
    () => ({ tab, isActive }),
    [tab, isActive],
  );
  if (tab.isInitial || !tab.filePath) {
    return wrapTabContext(ctx, <NoFileOpen />);
  }
  return wrapTabContext(ctx, resolveViewer(tab.filePath));
}

export function TexworkspaceToolbarWrapper({ tab }: { tab: RightTab }) {
  const compileFile = tab.fileId ?? null;
  return <TexworkspaceToolbar compileFile={compileFile} />;
}
