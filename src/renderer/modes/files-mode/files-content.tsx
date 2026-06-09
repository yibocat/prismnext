import { useMemo } from "react";
import type { RightTab } from "@/lib/mode-registry";
import { TabContext, type TabContextValue } from "@/lib/tab-context";
import { NoFileOpen } from "@/components/modules/editor/no-file-open";
import { MarkdownPreview, resolveViewer, wrapTabContext } from "@/lib/mode-utils";

export function FilesContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const ctx: TabContextValue = useMemo(
    () => ({ tab, isActive }),
    [tab, isActive],
  );
  if (tab.isInitial || !tab.filePath) {
    return wrapTabContext(ctx, <NoFileOpen />);
  }
  if (tab.viewMode === "preview") {
    if (!isActive) return null;
    return wrapTabContext(ctx, <MarkdownPreview />);
  }
  return wrapTabContext(ctx, resolveViewer(tab.filePath));
}
