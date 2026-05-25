import { useState, useCallback } from "react";
import type { RightTab } from "@/stores/right-panel-store";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

function DropZone({ active, onDragOver, onDrop }: {
  active: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className="shrink-0 w-1.5 self-stretch flex items-center cursor-default"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className={cn(
        "w-px h-full mx-auto transition-colors",
        active ? "bg-primary" : "bg-transparent",
      )} />
    </div>
  );
}

interface TabBarProps {
  tabs: RightTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

export function TabBar({ tabs, activeTabId, onSelect, onClose, onReorder }: TabBarProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [side, setSide] = useState<"left" | "right">("right");

  const reset = useCallback(() => {
    setDragIndex(null);
    setOverIndex(null);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragIndex === null || dragIndex === index) {
        setOverIndex(null);
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      setOverIndex(index);
      setSide(e.clientX < mid ? "left" : "right");
    },
    [dragIndex],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      reset();
      if (dragIndex === null || dragIndex === targetIndex || !onReorder) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      const offset = e.clientX < mid ? 0 : 1;
      const to = dragIndex < targetIndex + offset ? targetIndex + offset - 1 : targetIndex + offset;
      onReorder(dragIndex, to);
    },
    [dragIndex, onReorder],
  );

  if (tabs.length === 0) return null;

  return (
    <div className="scrollbar-none flex min-w-0 items-center gap-0.5 overflow-x-auto" onDragEnd={reset}>
      {/* Drop zone before first tab */}
      <DropZone
        active={overIndex === 0 && side === "left"}
        onDragOver={(e) => { e.preventDefault(); setOverIndex(0); setSide("left"); }}
        onDrop={(e) => { e.preventDefault(); reset(); if (dragIndex !== null && onReorder) onReorder(dragIndex, 0); }}
      />
      {tabs.map((tab, i) => (
        <ContextMenu key={tab.id}>
          <ContextMenuTrigger asChild>
            <div className="flex shrink-0">
              {overIndex === i && side === "left" && (
                <div className="mx-0.5 w-0.5 rounded-full bg-primary" />
              )}
              <div
                draggable
                className={cn(
                  "group flex w-[120px] shrink-0 items-center rounded px-2 py-1",
                  "text-[length:var(--font-toolbar-tab)] cursor-default select-none transition-colors",
                  "border-r border-border/30 last:border-r-0",
                  tab.id === activeTabId
                    ? "bg-muted text-foreground"
                    : "bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  dragIndex === i && "opacity-40",
                )}
                onClick={() => onSelect(tab.id)}
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
              >
                <span className="truncate">{tab.title}</span>
                <button
                  type="button"
                  className="ml-auto flex size-4 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                >
                  <XIcon className="size-2.5" />
                </button>
              </div>
              {overIndex === i && side === "right" && (
                <div className="mx-0.5 h-[var(--height-tab-bar)] w-0.5 rounded-full bg-primary" />
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-40">
            <ContextMenuItem onClick={() => onClose(tab.id)}>Close</ContextMenuItem>
            <ContextMenuItem
              onClick={() => { for (const t of tabs) { if (t.id !== tab.id) onClose(t.id); } }}
            >
              Close Others
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
      {/* Drop zone after last tab */}
      <DropZone
        active={overIndex === tabs.length - 1 && side === "right"}
        onDragOver={(e) => { e.preventDefault(); setOverIndex(tabs.length - 1); setSide("right"); }}
        onDrop={(e) => { e.preventDefault(); reset(); if (dragIndex !== null && onReorder) onReorder(dragIndex, tabs.length); }}
      />
    </div>
  );
}
