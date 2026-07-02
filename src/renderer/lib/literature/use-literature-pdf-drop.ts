import { useCallback, useEffect, useRef, useState, type DragEventHandler } from "react";
import { toast } from "sonner";
import { useLiteratureStore } from "@/stores/literature-store";
import { bindLiteraturePdfDragZone } from "./literature-pdf-drag-overlay";

function isPdfFileName(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

function hasFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes("Files");
}

function collectPdfPaths(dataTransfer: DataTransfer): string[] {
  const paths: string[] = [];
  for (const file of Array.from(dataTransfer.files)) {
    if (!isPdfFileName(file.name)) continue;
    paths.push(window.electronAPI.getPathForFile(file));
  }
  return paths;
}

export function useLiteraturePdfDrop(projectRoot: string | null) {
  const enqueuePdfImports = useLiteratureStore((s) => s.enqueuePdfImports);
  const zoneRef = useRef<HTMLDivElement>(null);
  const enabled = Boolean(projectRoot);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const el = zoneRef.current;
    if (!el || !enabled) {
      setDragActive(false);
      return;
    }
    return bindLiteraturePdfDragZone(el, setDragActive);
  }, [enabled]);

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
      const paths = collectPdfPaths(e.dataTransfer!);
      if (paths.length === 0) {
        toast.info("Drop PDF files only");
        return;
      }
      enqueuePdfImports(projectRoot!, paths);
    },
    [enabled, projectRoot, enqueuePdfImports],
  );

  return {
    dragActive: enabled && dragActive,
    zoneRef,
    dropHandlers: { onDragOver, onDrop },
  };
}
