import { useLayoutStore } from "@/stores/layout-store";
import { RightMainArea } from "@/components/layout/right-main-area";
import { RightSidebar } from "@/components/layout/right-sidebar";

export function RightArea({ maximized }: { maximized?: boolean }) {
  const editorTabs = useLayoutStore((s) => s.modeEditorTabs[s.activeMode]);
  const rightAreaWidth = useLayoutStore((s) => s.rightAreaWidth);
  const setRightAreaWidth = useLayoutStore((s) => s.setRightAreaWidth);
  const hasOpenFiles = editorTabs.length > 0;

  return (
    <div
      className="relative flex min-w-0"
      style={maximized ? { flex: 1 } : { width: hasOpenFiles ? rightAreaWidth : undefined }}
    >
      {hasOpenFiles && !maximized && (
        <div
          className="absolute left-0 top-0 h-full w-[3px] cursor-col-resize hover:bg-primary/30 z-10 transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = rightAreaWidth;
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
          }}
        />
      )}

      {hasOpenFiles && <RightMainArea />}
      <RightSidebar />
    </div>
  );
}
