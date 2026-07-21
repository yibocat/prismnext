import type { RightTab } from "@/lib/workspace/mode-registry";
import { MarkdownToolbarControls } from "@/components/modules/editor/toolbars/markdown-toolbar";
import { PlanDraftToolbar } from "@/components/modules/chat/plan-draft-toolbar";
import { useRightPanelStore } from "@/stores/right-panel-store";

/**
 * Dedicated Plan tab toolbar: markdown preview + line-width, plus Approve/Deny
 * when a pending draft is ready. No Files-mode extras (literature note link, etc.).
 */
export function ResearchPlanToolbar({ tab }: { tab: RightTab }) {
  const setTabViewMode = useRightPanelStore((s) => s.setTabViewMode);
  const viewMode = (tab.viewMode ?? "preview") as "source" | "preview";

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1">
      <MarkdownToolbarControls
        viewMode={viewMode}
        onViewModeChange={(mode) => setTabViewMode(tab.id, mode)}
      />
      <PlanDraftToolbar filePath={tab.filePath} />
    </div>
  );
}
