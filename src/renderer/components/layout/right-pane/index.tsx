import { cn } from "@/lib/utils";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { PaneContent } from "./content";

interface RightPaneProps {
  tabs: RightTab[];
  activeTabId: string | null;
}

/**
 * Keep every open tab mounted. Inactive tabs stay in the tree as
 * `absolute + invisible` so editors/PDF keep scroll, cursor, and undo.
 *
 * Opaque `bg-background` + `isolation` avoids the old LogViewer compositor bleed
 * that forced active-only mounting in v0.4.4.
 */
export function RightPane({ tabs, activeTabId }: RightPaneProps) {
  if (tabs.length === 0) {
    return (
      <div data-surface="content" className="flex h-full flex-col min-w-0">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
            Open a file to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-surface="content" className="relative isolate flex h-full min-w-0 flex-col overflow-hidden">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={cn(
              "flex min-h-0 flex-col overflow-hidden bg-background",
              isActive
                ? "relative z-0 h-full flex-1"
                : "pointer-events-none invisible absolute inset-0 z-[-1]",
            )}
            aria-hidden={!isActive}
          >
            <PaneContent activeTab={tab} isActive={isActive} />
          </div>
        );
      })}
    </div>
  );
}
