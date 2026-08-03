import { COMPOSER_INSERT_MIME } from "./composer-drag";

type OverlayListener = (active: boolean) => void;

function hasFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes("Files");
}

function hasComposerInsertDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes(COMPOSER_INSERT_MIME);
}

/** OS files or internal composer chip drags (literature, files, snippets, …). */
export function hasChatDropDrag(dataTransfer: DataTransfer | null): boolean {
  return hasFileDrag(dataTransfer) || hasComposerInsertDrag(dataTransfer);
}

/** Track file / composer-chip drag entering/leaving a single zone. */
export function bindChatFileDragZone(
  element: HTMLElement,
  listener: OverlayListener,
): () => void {
  const onDragEnter = (e: DragEvent) => {
    if (!hasChatDropDrag(e.dataTransfer)) return;
    const from = e.relatedTarget as Node | null;
    if (from && element.contains(from)) return;
    listener(true);
  };

  const onDragLeave = (e: DragEvent) => {
    if (!hasChatDropDrag(e.dataTransfer)) return;
    const next = e.relatedTarget as Node | null;
    if (next && element.contains(next)) return;
    listener(false);
  };

  const onEnd = () => listener(false);

  const opts: AddEventListenerOptions = { capture: true };
  element.addEventListener("dragenter", onDragEnter, opts);
  element.addEventListener("dragleave", onDragLeave, opts);
  document.addEventListener("drop", onEnd, opts);
  document.addEventListener("dragend", onEnd, opts);

  return () => {
    element.removeEventListener("dragenter", onDragEnter, opts);
    element.removeEventListener("dragleave", onDragLeave, opts);
    document.removeEventListener("drop", onEnd, opts);
    document.removeEventListener("dragend", onEnd, opts);
    listener(false);
  };
}

/** Capsule morph shell — outline only so drag hover never fights border/size morph. */
export const chatCapsuleFileDropActiveClass =
  "outline outline-2 outline-dashed outline-primary/45 outline-offset-[-2px]";

/** Chat content / panel drop zone while dragging files. */
export const chatFileDropZoneClass =
  "border-2 border-dashed border-primary/40 transition-[border-color] duration-150";
