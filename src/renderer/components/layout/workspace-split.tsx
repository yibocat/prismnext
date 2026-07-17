import { useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Group,
  Panel,
  Separator,
  useGroupRef,
  type PanelImperativeHandle,
} from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout-store";
import {
  PANEL_RESIZE_HIT,
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
  /** When true, left panel is collapsed (0 width) — children stay mounted. */
  leftCollapsed?: boolean;
  /** Fired when user drags past collapse/expand thresholds for the left pane. */
  onLeftCollapsedChange?: (collapsed: boolean) => void;
  /** When true, right panel is collapsed (0 width) — children stay mounted. */
  rightCollapsed?: boolean;
  /** Fired when user drags the sash past collapse/expand thresholds (e.g. Literature Notes). */
  onRightCollapsedChange?: (collapsed: boolean) => void;
}

function isUsableSplitLayout(
  layout: Record<string, number>,
  leftId: string,
  rightId: string,
): boolean {
  const leftPct = layout[leftId] ?? 0;
  const rightPct = layout[rightId] ?? 0;
  return (
    leftPct >= WORKSPACE_SPLIT_EXPAND_PERCENT &&
    rightPct >= WORKSPACE_SPLIT_EXPAND_PERCENT
  );
}

function pct(n: number): string {
  return `${n}%`;
}

/**
 * Horizontal resizable split — shared by TeX workspace and literature reader.
 *
 * Pane DOM order is always left → separator → right (RRP resize depends on it).
 * TeX editor/PDF swap must change slot *content*, never reverse flex/order.
 */
export function WorkspaceSplit({
  left,
  right,
  leftId = "left",
  rightId = "right",
  defaultLeft = 60,
  layoutKey,
  leftCollapsed = false,
  onLeftCollapsedChange,
  rightCollapsed = false,
  onRightCollapsedChange,
}: WorkspaceSplitProps) {
  const key = layoutKey ?? `${leftId}:${rightId}`;
  const savedLayout = useLayoutStore((s) => s.workspaceSplitLayouts[key]);
  const setWorkspaceSplitLayout = useLayoutStore((s) => s.setWorkspaceSplitLayout);
  const groupRef = useGroupRef();
  const leftPanelRef = useRef<PanelImperativeHandle>(null);
  const rightPanelRef = useRef<PanelImperativeHandle>(null);
  const lastSplitLayoutRef = useRef<Record<string, number> | null>(null);
  const sashDraggingRef = useRef(false);
  const programmaticDepthRef = useRef(0);

  const leftCollapsible = leftCollapsed || onLeftCollapsedChange != null;
  const rightCollapsible = rightCollapsed || onRightCollapsedChange != null;

  const fallbackSplit = useMemo(
    () => ({ [leftId]: defaultLeft, [rightId]: 100 - defaultLeft }),
    [leftId, rightId, defaultLeft],
  );

  const defaultLayout = useMemo(() => {
    if (rightCollapsed && !leftCollapsed) {
      return { [leftId]: 100, [rightId]: 0 };
    }
    if (leftCollapsed && !rightCollapsed) {
      return { [leftId]: 0, [rightId]: 100 };
    }
    if (savedLayout && isUsableSplitLayout(savedLayout, leftId, rightId)) {
      return { [leftId]: savedLayout[leftId], [rightId]: savedLayout[rightId] };
    }
    return fallbackSplit;
  }, [
    savedLayout,
    leftId,
    rightId,
    leftCollapsed,
    rightCollapsed,
    fallbackSplit,
  ]);

  useLayoutEffect(() => {
    if (savedLayout && isUsableSplitLayout(savedLayout, leftId, rightId)) {
      lastSplitLayoutRef.current = {
        [leftId]: savedLayout[leftId],
        [rightId]: savedLayout[rightId],
      };
    } else if (!lastSplitLayoutRef.current) {
      lastSplitLayoutRef.current = { ...fallbackSplit };
    }
  }, [key, savedLayout, leftId, rightId, fallbackSplit]);

  useLayoutEffect(() => {
    const endDrag = () => {
      sashDraggingRef.current = false;
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, []);

  const rememberSplitIfValid = useCallback(
    (layout: Record<string, number>) => {
      if (!isUsableSplitLayout(layout, leftId, rightId)) return;
      lastSplitLayoutRef.current = {
        [leftId]: layout[leftId],
        [rightId]: layout[rightId],
      };
      setWorkspaceSplitLayout(key, lastSplitLayoutRef.current);
    },
    [key, leftId, rightId, setWorkspaceSplitLayout],
  );

  const restoredSplitLayout = useCallback(() => {
    const remembered = lastSplitLayoutRef.current;
    if (remembered && isUsableSplitLayout(remembered, leftId, rightId)) {
      return remembered;
    }
    if (savedLayout && isUsableSplitLayout(savedLayout, leftId, rightId)) {
      return {
        [leftId]: savedLayout[leftId],
        [rightId]: savedLayout[rightId],
      };
    }
    return fallbackSplit;
  }, [savedLayout, leftId, rightId, fallbackSplit]);

  // Apply collapse/expand from controlled props (toolbar three-state, notes toggle).
  useLayoutEffect(() => {
    const group = groupRef.current;
    const leftPanel = leftPanelRef.current;
    const rightPanel = rightPanelRef.current;
    if (!group || !leftPanel || !rightPanel) return;

    programmaticDepthRef.current += 1;
    let cleared = false;
    const clear = () => {
      if (cleared) return;
      cleared = true;
      programmaticDepthRef.current = Math.max(0, programmaticDepthRef.current - 1);
    };

    if (leftCollapsed && !rightCollapsed) {
      rememberSplitIfValid(group.getLayout());
      // tex ↔ pdf can flip which side is collapsed; always expand the keeper first.
      if (rightPanel.isCollapsed()) rightPanel.expand();
      leftPanel.collapse();
      group.setLayout({ [leftId]: 0, [rightId]: 100 });
    } else if (rightCollapsed && !leftCollapsed) {
      rememberSplitIfValid(group.getLayout());
      if (leftPanel.isCollapsed()) leftPanel.expand();
      rightPanel.collapse();
      group.setLayout({ [leftId]: 100, [rightId]: 0 });
    } else if (!leftCollapsed && !rightCollapsed) {
      if (leftPanel.isCollapsed()) leftPanel.expand();
      if (rightPanel.isCollapsed()) rightPanel.expand();
      group.setLayout(restoredSplitLayout());
    }

    const timer = window.setTimeout(clear, 250);
    return () => {
      window.clearTimeout(timer);
      clear();
    };
  }, [
    leftCollapsed,
    rightCollapsed,
    leftId,
    rightId,
    groupRef,
    rememberSplitIfValid,
    restoredSplitLayout,
  ]);

  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      if (programmaticDepthRef.current > 0) return;

      const leftPct = layout[leftId] ?? 0;
      const rightPct = layout[rightId] ?? 0;
      const allowCollapseNotify = sashDraggingRef.current;

      if (allowCollapseNotify && onLeftCollapsedChange) {
        if (leftCollapsed) {
          if (leftPct >= WORKSPACE_SPLIT_EXPAND_PERCENT) {
            onLeftCollapsedChange(false);
          }
        } else if (leftPct <= WORKSPACE_SPLIT_COLLAPSE_PERCENT) {
          onLeftCollapsedChange(true);
          return;
        }
      }

      if (allowCollapseNotify && onRightCollapsedChange) {
        if (rightCollapsed) {
          if (rightPct >= WORKSPACE_SPLIT_EXPAND_PERCENT) {
            onRightCollapsedChange(false);
          }
        } else if (rightPct <= WORKSPACE_SPLIT_COLLAPSE_PERCENT) {
          onRightCollapsedChange(true);
          return;
        }
      }

      if (leftCollapsed || rightCollapsed) return;
      rememberSplitIfValid(layout);
    },
    [
      leftId,
      rightId,
      leftCollapsed,
      rightCollapsed,
      onLeftCollapsedChange,
      onRightCollapsedChange,
      rememberSplitIfValid,
    ],
  );

  return (
    <Group
      orientation="horizontal"
      className="min-h-0 flex-1"
      groupRef={groupRef}
      resizeTargetMinimumSize={PANEL_RESIZE_HIT}
      disableCursor
      defaultLayout={defaultLayout}
      onLayoutChanged={handleLayoutChanged}
    >
      <Panel
        id={leftId}
        panelRef={leftPanelRef}
        collapsible={leftCollapsible}
        collapsedSize="0%"
        minSize={150}
        defaultSize={pct(defaultLayout[leftId] ?? defaultLeft)}
      >
        {left}
      </Panel>
      <Separator
        id={`sep-${leftId}`}
        className={WORKSPACE_SPLIT_SEPARATOR_CLASS}
        onPointerDown={() => {
          sashDraggingRef.current = true;
        }}
      />
      <Panel
        id={rightId}
        panelRef={rightPanelRef}
        collapsible={rightCollapsible}
        collapsedSize="0%"
        minSize={150}
        defaultSize={pct(defaultLayout[rightId] ?? 100 - defaultLeft)}
      >
        {right}
      </Panel>
    </Group>
  );
}
