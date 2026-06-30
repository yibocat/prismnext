import { useCallback, useMemo, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout-store";

export const WORKSPACE_SPLIT_SEPARATOR_CLASS =
  "w-px bg-border hover:bg-foreground/30 transition-colors outline-none relative after:absolute after:inset-y-0 after:-left-1 after:-right-1";

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
}

/** Horizontal resizable split — shared by TeX workspace and literature reader. */
export function WorkspaceSplit({
  left,
  right,
  leftId = "left",
  rightId = "right",
  defaultLeft = 60,
  layoutKey,
}: WorkspaceSplitProps) {
  const key = layoutKey ?? `${leftId}:${rightId}`;
  const savedLayout = useLayoutStore((s) => s.workspaceSplitLayouts[key]);
  const setWorkspaceSplitLayout = useLayoutStore((s) => s.setWorkspaceSplitLayout);

  const defaultLayout = useMemo(() => {
    const leftSize = savedLayout?.[leftId];
    const rightSize = savedLayout?.[rightId];
    if (leftSize != null && rightSize != null) {
      return { [leftId]: leftSize, [rightId]: rightSize };
    }
    return { [leftId]: defaultLeft, [rightId]: 100 - defaultLeft };
  }, [savedLayout, leftId, rightId, defaultLeft]);

  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      setWorkspaceSplitLayout(key, layout);
    },
    [key, setWorkspaceSplitLayout],
  );

  return (
    <Group
      orientation="horizontal"
      className="flex-1 min-h-0"
      resizeTargetMinimumSize={{ fine: 5, coarse: 5 }}
      defaultLayout={defaultLayout}
      onLayoutChanged={handleLayoutChanged}
    >
      <Panel id={leftId} minSize={150} defaultSize={defaultLayout[leftId]}>
        {left}
      </Panel>
      <Separator id={`sep-${leftId}`} className={WORKSPACE_SPLIT_SEPARATOR_CLASS} />
      <Panel id={rightId} minSize={150} defaultSize={defaultLayout[rightId]}>
        {right}
      </Panel>
    </Group>
  );
}
