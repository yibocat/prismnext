import { useCallback, useEffect, useState, type DragEventHandler } from "react";
import { useComposerInsertStore } from "@/stores/composer-insert-store";
import { useLayoutStore } from "@/stores/layout-store";
import { bindChatFileDragZone } from "./chat-file-drag-overlay";

function hasFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes("Files");
}

function collectFilePaths(dataTransfer: DataTransfer): string[] {
  const paths: string[] = [];
  for (const file of Array.from(dataTransfer.files)) {
    const p = window.electronAPI.getPathForFile?.(file);
    if (typeof p === "string" && p.trim()) paths.push(p);
  }
  return paths;
}

/** True while the OS is dragging files over the window (any target). */
export function useOsFileDragging(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      setActive(true);
    };
    const onLeave = (e: DragEvent) => {
      if (e.relatedTarget == null) setActive(false);
    };
    const clear = () => setActive(false);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", clear);
    window.addEventListener("dragend", clear);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", clear);
      window.removeEventListener("dragend", clear);
    };
  }, []);

  return active;
}

export interface UseChatFileDropOptions {
  enabled?: boolean;
  /** Called after paths are queued (e.g. open AiBar capsule). */
  onQueued?: () => void;
}

/** Drop files onto chat content / capsule → composer attachments. */
export function useChatFileDrop(opts: UseChatFileDropOptions = {}) {
  const enabled = opts.enabled !== false;
  const onQueued = opts.onQueued;
  const [zoneEl, setZoneEl] = useState<HTMLDivElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const zoneRef = useCallback((node: HTMLDivElement | null) => {
    setZoneEl(node);
  }, []);

  useEffect(() => {
    if (!zoneEl || !enabled) {
      setDragActive(false);
      return;
    }
    return bindChatFileDragZone(zoneEl, setDragActive);
  }, [enabled, zoneEl]);

  const onDragOver: DragEventHandler<HTMLElement> = useCallback(
    (e) => {
      if (!enabled || !hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    },
    [enabled],
  );

  const onDrop: DragEventHandler<HTMLElement> = useCallback(
    (e) => {
      if (!enabled || !hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      const paths = collectFilePaths(e.dataTransfer!);
      if (paths.length === 0) return;
      useComposerInsertStore.getState().requestAttachPaths(paths);
      useLayoutStore.getState().requestAiBarComposerFocus();
      onQueued?.();
    },
    [enabled, onQueued],
  );

  return {
    dragActive: enabled && dragActive,
    zoneRef,
    dropHandlers: { onDragOver, onDrop },
  };
}
