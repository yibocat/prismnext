/**
 * Shell sash detent — pointer math only. Persist happens on pointer-up
 * in the sash component. Window layout never uses this.
 *
 * Stick at the rail min (280). Another half-min of travel (~140px) collapses
 * to 0. Opening from 0 uses the same detent the other way.
 */
import { SIDEBAR_LEFT_MIN } from "@/styles/constants";

export const SHELL_SASH_DETENT_ARM_PX = Math.round(SIDEBAR_LEFT_MIN / 2);

let sashDragging = false;

export function beginShellSashDrag(): void {
  sashDragging = true;
}

export function endShellSashDrag(): void {
  sashDragging = false;
}

export function isShellSashDragging(): boolean {
  return sashDragging;
}

export type ShellSashRail = "left" | "right";

export function shellSashDeltaPx(
  rail: ShellSashRail,
  startPointerX: number,
  pointerX: number,
): number {
  return rail === "left" ? pointerX - startPointerX : startPointerX - pointerX;
}

export function resolveShellSashWidth(args: {
  startWidthPx: number;
  deltaPx: number;
  minPx: number;
  maxPx: number;
  collapsedAtStart: boolean;
  detentArmPx?: number;
}): { widthPx: number; collapsed: boolean } {
  const arm = args.detentArmPx ?? SHELL_SASH_DETENT_ARM_PX;
  const minPx = args.minPx;
  const maxPx = Math.max(minPx, args.maxPx);

  if (args.collapsedAtStart) {
    if (args.deltaPx < arm) {
      return { widthPx: 0, collapsed: true };
    }
    return {
      widthPx: clampPx(minPx + (args.deltaPx - arm), minPx, maxPx),
      collapsed: false,
    };
  }

  const raw = args.startWidthPx + args.deltaPx;
  if (raw >= minPx) {
    return { widthPx: clampPx(raw, minPx, maxPx), collapsed: false };
  }
  if (minPx - raw < arm) {
    return { widthPx: minPx, collapsed: false };
  }
  return { widthPx: 0, collapsed: true };
}

function clampPx(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}
