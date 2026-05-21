import { useCallback, useRef } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { RightMainArea } from "@/components/layout/right-main-area";
import { RightSidebar } from "@/components/layout/right-sidebar";

export function RightArea({ maximized }: { maximized?: boolean }) {
  const editorTabs = useLayoutStore((s) => s.modeEditorTabs[s.activeMode]);
  const rightAreaWidth = useLayoutStore((s) => s.rightAreaWidth);
  const setRightAreaWidth = useLayoutStore((s) => s.setRightAreaWidth);
  const hasOpenFiles = editorTabs.length > 0;

  const widthRef = useRef(rightAreaWidth);
  widthRef.current = rightAreaWidth;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      const onMove = (ev: MouseEvent) => {
        const nextWidth = startWidth + startX - ev.clientX;
        setRightAreaWidth(Math.min(1100, Math.max(350, nextWidth)));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [setRightAreaWidth],
  );

  return (
    <div
      className="flex min-w-0"
      style={maximized ? { flex: 1 } : { width: hasOpenFiles ? rightAreaWidth : undefined }}
    >
      {/* Resize handle — standalone flex child at the left edge of RightArea */}
      {hasOpenFiles && !maximized && (
        <div
          className="shrink-0 w-[5px] cursor-col-resize hover:bg-primary/30 transition-colors"
          onMouseDown={handleMouseDown}
        />
      )}

      {hasOpenFiles && <RightMainArea />}
      <RightSidebar />
    </div>
  );
}
