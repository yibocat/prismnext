import { Suspense } from "react";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { modeRegistry } from "@/lib/workspace/mode-registry";

interface PaneContentProps {
  activeTab: RightTab | undefined;
  isActive: boolean;
}

export function PaneContent({ activeTab, isActive }: PaneContentProps) {
  if (!activeTab) return null;

  const def = modeRegistry.findByTabKind(activeTab.kind);
  const Content = def?.Content;

  if (!Content) return null;

  return (
    <Suspense fallback={
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </div>
    }>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <Content tab={activeTab} isActive={isActive} />
      </div>
    </Suspense>
  );
}
