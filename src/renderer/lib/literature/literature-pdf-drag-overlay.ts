type OverlayListener = (active: boolean) => void;

function hasFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes("Files");
}

/** Track file drag entering/leaving a single zone element (relatedTarget — no spurious depth). */
export function bindLiteraturePdfDragZone(
  element: HTMLElement,
  listener: OverlayListener,
): () => void {
  const onDragEnter = (e: DragEvent) => {
    if (!hasFileDrag(e.dataTransfer)) return;
    const from = e.relatedTarget as Node | null;
    if (from && element.contains(from)) return;
    listener(true);
  };

  const onDragLeave = (e: DragEvent) => {
    if (!hasFileDrag(e.dataTransfer)) return;
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
