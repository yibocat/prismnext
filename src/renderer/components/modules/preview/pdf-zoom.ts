import type { RefObject } from "react";

type Viewport = { width: number; height: number };
type ZoomOptions = { minZoom: number; maxZoom: number };

export type PdfZoomMode = "custom" | "fit-width" | "fit-height" | "fit-page" | "actual-size";

export const PDF_ZOOM_MODE_LABELS: Record<PdfZoomMode, string> = {
  custom: "",
  "fit-width": "Fit width",
  "fit-height": "Fit height",
  "fit-page": "Fit page",
  "actual-size": "Actual size",
};

export interface PdfZoomStoreSlice {
  viewportRef: RefObject<HTMLDivElement | null>;
  viewports: Viewport[];
  zoomOptions: ZoomOptions;
  currentPage: number;
  updateZoom: (zoom: number | ((prev: number) => number), isZoomFitWidth?: boolean) => void;
  zoomFitWidth: () => number | void;
}

function clampZoom(value: number, { minZoom, maxZoom }: ZoomOptions): number {
  return Math.min(Math.max(value, minZoom), maxZoom);
}

function containerInnerSize(container: HTMLElement): { width: number; height: number } {
  const style = getComputedStyle(container);
  const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  return {
    width: Math.max(0, container.clientWidth - padX),
    height: Math.max(0, container.clientHeight - padY),
  };
}

/** Compute zoom for fit-height / fit-page / actual-size (Lector has built-in fit-width). */
export function computePdfZoom(
  mode: Exclude<PdfZoomMode, "custom" | "fit-width">,
  container: HTMLElement,
  viewports: Viewport[],
  zoomOptions: ZoomOptions,
  currentPage: number,
): number {
  if (!viewports.length) return 1;

  const { width: viewW, height: viewH } = containerInnerSize(container);
  const pageIndex = Math.min(Math.max(currentPage - 1, 0), viewports.length - 1);
  const page = viewports[pageIndex] ?? viewports[0];
  const maxPageWidth = Math.max(...viewports.map((v) => v.width));

  switch (mode) {
    case "actual-size":
      return clampZoom(1, zoomOptions);
    case "fit-height":
      return clampZoom(viewH / page.height, zoomOptions);
    case "fit-page":
      return clampZoom(Math.min(viewW / page.width, viewH / page.height), zoomOptions);
    default:
      return clampZoom(viewW / maxPageWidth, zoomOptions);
  }
}

export function applyPdfZoomMode(mode: PdfZoomMode, store: PdfZoomStoreSlice): void {
  const container = store.viewportRef.current;
  if (!container || !store.viewports.length) return;

  if (mode === "fit-width") {
    store.zoomFitWidth();
    return;
  }

  if (mode === "custom") return;

  const zoom = computePdfZoom(mode, container, store.viewports, store.zoomOptions, store.currentPage);
  store.updateZoom(zoom, false);
}
