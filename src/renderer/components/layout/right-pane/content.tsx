import { Suspense } from "react";
import type { RightTab } from "@/lib/mode-registry";
import { modeRegistry } from "@/lib/mode-registry";

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
      <div className="flex-1 flex items-center justify-center">
        <div className="w-32 h-4 rounded bg-muted animate-pulse" />
      </div>
    }>
      <Content tab={activeTab} isActive={isActive} />
    </Suspense>
  );
}
