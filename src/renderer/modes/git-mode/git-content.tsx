import { useMemo, lazy } from "react";
import type { RightTab } from "@/lib/mode-registry";
import { useDocumentStore } from "@/stores/document-store";
import { TabContext, type TabContextValue } from "@/lib/tab-context";
import { resolveViewer, wrapTabContext } from "@/lib/mode-utils";
import { GitToolbar } from "./git-toolbar";

const GitViewer = lazy(() => import("./git-viewer").then((m) => ({ default: m.default })));

export function GitToolbarWrapper({ tab }: { tab: RightTab }) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  return <GitToolbar projectRoot={projectRoot ?? ""} />;
}

export function GitContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const ctx: TabContextValue = useMemo(() => ({ tab, isActive }), [tab, isActive]);
  if (tab.kind === "git-overview") {
    return wrapTabContext(ctx, <GitViewer projectRoot={projectRoot ?? ""} />);
  }
  return wrapTabContext(ctx, resolveViewer(tab.filePath ?? ""));
}
