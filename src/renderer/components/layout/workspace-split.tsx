import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout-store";
import {
  WORKSPACE_SPLIT_COLLAPSE_PERCENT,
  WORKSPACE_SPLIT_EXPAND_PERCENT,
  PANEL_SASH_SEPARATOR_CLASS,
} from "@/lib/workspace/layout-constants";

export const WORKSPACE_SPLIT_SEPARATOR_CLASS = PANEL_SASH_SEPARATOR_CLASS;

export interface WorkspaceSplitProps {
  left: ReactNode;
  right: ReactNode;
  /** Panel id for the left pane (TeX: `pdf`, literature: `lit-pdf`). */
  leftId?: string;
  /** Panel id for the right pane (TeX: `editor`, literature: `lit-notes`). */
  rightId?: string;
  /** Left panel default size percentage (0–100). */
  defaultLeft?: number;
  /** Key for persisting layout in layout-store (defaults to `{leftId}:{rightId}`). */
  layoutKey?: string;
  /** When true, right panel is collapsed (0 width) — children stay mounted. */
  rightCollapsed?: boolean;
  /** Fired when user drags the sash past collapse/expand thresholds (e.g. Literature Notes). */
  onRightCollapsedChange?: (collapsed: boolean) => void;
}

/** Horizontal resizable split — shared by TeX workspace and literature reader. */
export function WorkspaceSplit({
  left,
  right,
  leftId = "left",
  rightId = "right",
  defaultLeft = 60,
  layoutKey,
  rightCollapsed = false,
  onRightCollapsedChange,
}: WorkspaceSplitProps) {
  const key = layoutKey ?? `${leftId}:${rightId}`;
  const savedLayout = useLayoutStore((s) => s.workspaceSplitLayouts[key]);
  const setWorkspaceSplitLayout = useLayoutStore((s) => s.setWorkspaceSplitLayout);
  const rightPanelRef = useRef<PanelImperativeHandle>(null);

  const defaultLayout = useMemo(() => {
    if (rightCollapsed) {
      return { [leftId]: 100, [rightId]: 0 };
    }
    const leftSize = savedLayout?.[leftId];
    const rightSize = savedLayout?.[rightId];
    if (leftSize != null && rightSize != null) {
      return { [leftId]: leftSize, [rightId]: rightSize };
    }
    return { [leftId]: defaultLeft, [rightId]: 100 - defaultLeft };
  }, [savedLayout, leftId, rightId, defaultLeft, rightCollapsed]);

  useEffect(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (rightCollapsed) {
      panel.collapse();
    } else {
      panel.expand();
    }
  }, [rightCollapsed]);

  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      const rightPct = layout[rightId] ?? 0;

      if (onRightCollapsedChange) {
        if (rightCollapsed) {
          if (rightPct >= WORKSPACE_SPLIT_EXPAND_PERCENT) {
            onRightCollapsedChange(false);
          }
        } else if (rightPct <= WORKSPACE_SPLIT_COLLAPSE_PERCENT) {
          onRightCollapsedChange(true);
        }
      }

      if (rightCollapsed) return;
      setWorkspaceSplitLayout(key, layout);
    },
    [key, rightId, setWorkspaceSplitLayout, rightCollapsed, onRightCollapsedChange],
  );

  return (
    <Group
      orientation="horizontal"
      className="flex-1 min-h-0"
      resizeTargetMinimumSize={{ fine: 8, coarse: 12 }}
      defaultLayout={defaultLayout}
      onLayoutChanged={handleLayoutChanged}
    >
      <Panel id={leftId} minSize={150} defaultSize={defaultLayout[leftId]}>
        {left}
      </Panel>
      <Separator
        id={`sep-${leftId}`}
        className={WORKSPACE_SPLIT_SEPARATOR_CLASS}
      />
      <Panel
        id={rightId}
        panelRef={rightPanelRef}
        collapsible
        collapsedSize={0}
        minSize={150}
        defaultSize={defaultLayout[rightId]}
      >
        {right}
      </Panel>
    </Group>
  );
}
