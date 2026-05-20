import { useLayoutStore } from "@/stores/layout-store";
import { PlusIcon, MessageSquareIcon } from "lucide-react";

export function LeftSidebar() {
  const sidebarExpanded = useLayoutStore((s) => s.sidebarExpanded);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);

  if (!sidebarExpanded) return null;

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-border bg-card"
      style={{ width: sidebarWidth }}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sessions
        </span>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="New Session"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-4">
        <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
          <MessageSquareIcon className="size-6 mx-auto mb-2 opacity-40" />
          Chat sessions
          <span className="mt-1 block text-[11px] opacity-60">coming soon</span>
        </p>
      </div>

      <div
        className="absolute right-0 top-0 h-full w-[3px] cursor-col-resize hover:bg-primary/30 transition-colors"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = sidebarWidth;
          const onMove = (ev: MouseEvent) => {
            setSidebarWidth(Math.min(420, Math.max(160, startWidth + ev.clientX - startX)));
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }}
      />
    </aside>
  );
}
