import type React from "react";
import { PDF_PAGE_CLASS, PDF_PAGES_CLASS } from "@/components/modules/preview/pdf-config";
import {
  blockRegions,
  type PaperExtractBlock,
} from "../../../shared/paper-extract-block";

export interface PageHitInfo {
  pageIdx: number;
  /** Normalized 0–1 coordinates within the page box. */
  x: number;
  y: number;
}

/** Resolve the lector page shell used for layout (position:relative inner box). */
export function findPdfPageElement(from: Element | null): HTMLElement | null {
  if (!from) return null;
  return from.closest(`.${PDF_PAGE_CLASS.split(" ")[0]}`) as HTMLElement | null;
}

/** Page number lives on TextLayer (`data-page-number`), not on `.prism-pdf-page`. */
export function pageNumberFromPageEl(pageEl: HTMLElement): number | null {
  const fromAttr = pageEl.getAttribute("data-page-number");
  if (fromAttr) {
    const n = Number.parseInt(fromAttr, 10);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  const nested = pageEl.querySelector("[data-page-number]");
  const nestedVal = nested?.getAttribute("data-page-number");
  if (!nestedVal) return null;
  const n = Number.parseInt(nestedVal, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function pageInfoFromPoint(clientX: number, clientY: number): PageHitInfo | null {
  const el = document.elementFromPoint(clientX, clientY);
  const pageEl = findPdfPageElement(el);
  if (!pageEl) return null;
  const pageNum = pageNumberFromPageEl(pageEl);
  if (!pageNum) return null;
  const rect = pageEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    pageIdx: pageNum - 1,
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

export function findLiteraturePdfScrollRoot(
  viewportRef: React.RefObject<HTMLElement | null>,
): HTMLElement | null {
  if (viewportRef.current) return viewportRef.current;
  return document.querySelector<HTMLElement>(
    `.literature-pdf-reader .${PDF_PAGES_CLASS.split(" ")[0]}`,
  );
}

function regionClientRect(
  pageIdx: number,
  bbox: readonly [number, number, number, number],
  viewportRef: React.RefObject<HTMLElement | null>,
): DOMRect | null {
  const page = pageIdx + 1;
  const root = viewportRef.current;
  if (!root) return null;
  const pageEl =
    (root
      .querySelector(`.prism-pdf-page [data-page-number="${page}"]`)
      ?.closest(".prism-pdf-page") as HTMLElement | null) ??
    (root.querySelector(`[data-page-number="${page}"]`) as HTMLElement | null);
  const pageShell = pageEl ? findPdfPageElement(pageEl) ?? pageEl : null;
  if (!pageShell) return null;
  const pageRect = pageShell.getBoundingClientRect();
  const [x0, y0, x1, y1] = bbox;
  return new DOMRect(
    pageRect.left + x0 * pageRect.width,
    pageRect.top + y0 * pageRect.height,
    (x1 - x0) * pageRect.width,
    (y1 - y0) * pageRect.height,
  );
}

/** Client rect of a block region on screen (for fixed-position menus). */
export function blockClientRect(
  block: PaperExtractBlock,
  viewportRef: React.RefObject<HTMLElement | null>,
): DOMRect | null {
  const regions = blockRegions(block);
  let union: DOMRect | null = null;
  for (const region of regions) {
    const rect = regionClientRect(region.pageIdx, region.bbox, viewportRef);
    if (!rect) continue;
    if (!union) {
      union = rect;
      continue;
    }
    const left = Math.min(union.left, rect.left);
    const top = Math.min(union.top, rect.top);
    const right = Math.max(union.right, rect.right);
    const bottom = Math.max(union.bottom, rect.bottom);
    union = new DOMRect(left, top, right - left, bottom - top);
  }
  return union;
}

/** Union of several blocks' regions on screen — menu anchor for multi-block pick. */
export function blocksUnionClientRect(
  blocks: PaperExtractBlock[],
  viewportRef: React.RefObject<HTMLElement | null>,
): DOMRect | null {
  let union: DOMRect | null = null;
  for (const block of blocks) {
    const rect = blockClientRect(block, viewportRef);
    if (!rect) continue;
    if (!union) {
      union = rect;
      continue;
    }
    const left = Math.min(union.left, rect.left);
    const top = Math.min(union.top, rect.top);
    const right = Math.max(union.right, rect.right);
    const bottom = Math.max(union.bottom, rect.bottom);
    union = new DOMRect(left, top, right - left, bottom - top);
  }
  return union;
}

const FLOAT_PAD = 8;

/** Place a floating panel beside an anchor, flipping/shifting to stay on screen. */
export function clampFloatingMenuPosition(
  anchor: DOMRectReadOnly,
  menuWidth: number,
  menuHeight: number,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = anchor.bottom + FLOAT_PAD;
  let left = anchor.left;

  if (top + menuHeight > vh - FLOAT_PAD) {
    top = anchor.top - menuHeight - FLOAT_PAD;
  }
  if (left + menuWidth > vw - FLOAT_PAD) {
    left = anchor.right - menuWidth;
  }

  top = Math.max(FLOAT_PAD, Math.min(top, vh - menuHeight - FLOAT_PAD));
  left = Math.max(FLOAT_PAD, Math.min(left, vw - menuWidth - FLOAT_PAD));
  return { top, left };
}
