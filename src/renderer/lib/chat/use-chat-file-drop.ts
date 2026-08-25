import { useCallback, useEffect, useState, type DragEventHandler } from "react";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { useComposerInsertStore } from "@/stores/composer-insert-store";
import { useLayoutStore } from "@/stores/layout-store";
import { bindChatFileDragZone, hasChatDropDrag } from "./chat-file-drag-overlay";
import { COMPOSER_INSERT_MIME, readComposerDragPayloads } from "./composer-drag";
import { insertComposerDragPayloads } from "./insert-to-chat";

function hasFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes("Files");
}

function hasComposerInsertDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes(COMPOSER_INSERT_MIME);
}

function collectFilePaths(dataTransfer: DataTransfer): string[] {
  const paths: string[] = [];
  for (const file of Array.from(dataTransfer.files)) {
    const p = fsDesktop.getPathForFile(file);
    if (typeof p === "string" && p.trim()) paths.push(p);
  }
  return paths;
}

/** True while the OS is dragging files over the window (any target). */
export function useOsFileDragging(): boolean {
  return useChatDropDragging().fileActive;
}

export type ChatDropDraggingState = {
  active: boolean;
  fileActive: boolean;
  composerActive: boolean;
};

/** True while files or composer chips are dragged anywhere in the window. */
export function useChatDropDragging(): ChatDropDraggingState {
  const [state, setState] = useState<ChatDropDraggingState>({
    active: false,
    fileActive: false,
    composerActive: false,
  });

  useEffect(() => {
    const sync = (dt: DataTransfer | null) => {
      const fileActive = hasFileDrag(dt);
      const composerActive = hasComposerInsertDrag(dt);
      setState({
        fileActive,
        composerActive,
        active: fileActive || composerActive,
      });
    };
    const onEnter = (e: DragEvent) => {
      if (!hasChatDropDrag(e.dataTransfer)) return;
      sync(e.dataTransfer);
    };
    const onOver = (e: DragEvent) => {
      if (!hasChatDropDrag(e.dataTransfer)) return;
      sync(e.dataTransfer);
    };
    const onLeave = (e: DragEvent) => {
      if (e.relatedTarget == null) {
        setState({ active: false, fileActive: false, composerActive: false });
      }
    };
    const clear = () => setState({ active: false, fileActive: false, composerActive: false });
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", clear);
    window.addEventListener("dragend", clear);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", clear);
      window.removeEventListener("dragend", clear);
    };
  }, []);

  return state;
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
      if (!enabled) return;
      if (hasComposerInsertDrag(e.dataTransfer) || hasFileDrag(e.dataTransfer)) {
        e.preventDefault();
        e.dataTransfer!.dropEffect = "copy";
      }
    },
    [enabled],
  );

  const onDrop: DragEventHandler<HTMLElement> = useCallback(
    (e) => {
      if (!enabled || e.defaultPrevented) return;
      const payloads = readComposerDragPayloads(e.dataTransfer);
      if (payloads.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        insertComposerDragPayloads(payloads);
        onQueued?.();
        return;
      }
      if (!hasFileDrag(e.dataTransfer)) return;
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
