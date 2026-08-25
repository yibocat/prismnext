/**
 * Pixel shell geometry (Left | Content | Right).
 *
 * Content is the flex surface. Left / split Right stay at sash pixels until
 * Content is at MAIN_AREA_MIN, then both rails yield toward 280, then Right
 * snap-closes (stays closed) and Left yields/folds. Maximized Right eats the
 * remainder; Left still water-fills. This module does not persist widths.
 *
 * A growing Right sash sticks Content at MAIN_AREA_MIN, then another detent
 * arm of travel previews maximize. Collapsing a sash to 0 is closed, not max.
 *
 * Settings sets `rightYieldEnabled: false` so the detail pane is not yielded.
 */
import {
  MAIN_AREA_MIN,
  RIGHT_AREA_MAX,
  RIGHT_AREA_MIN,
  SIDEBAR_LEFT_MAX,
  SIDEBAR_LEFT_MIN,
} from "@/styles/constants";
import { SHELL_SASH_DETENT_ARM_PX } from "@/lib/workspace/shell-sash";

export type ShellRightMode = "closed" | "split" | "maximize";

export type ShellGeometryInput = {
  windowPx: number;
  leftUserExpanded: boolean;
  leftWindowCollapsed: boolean;
  leftPinToMin: boolean;
  leftPreferredPx: number;
  rightMode: ShellRightMode;
  rightPreferredPx: number;
  /** Workspace split yields. Settings detail does not. Default true. */
  rightYieldEnabled?: boolean;
  /** User just opened Left in a narrow window — do not fold this frame. */
  crampedLeftAllowed?: boolean;
  sashLeftPx?: number;
  sashRightPx?: number;
};

export type ShellGeometry = {
  leftPx: number;
  centerPx: number;
  rightPx: number;
  rightMode: ShellRightMode;
  leftWindowCollapsed: boolean;
  leftPinToMin: boolean;
};

export function clampShellLeftPreferredPx(widthPx: number): number {
  const px = Number.isFinite(widthPx) ? Math.round(widthPx) : SIDEBAR_LEFT_MIN;
  return Math.min(Math.max(px, SIDEBAR_LEFT_MIN), SIDEBAR_LEFT_MAX);
}

export function clampShellRightPreferredPx(widthPx: number): number {
  const px = Number.isFinite(widthPx) ? Math.round(widthPx) : RIGHT_AREA_MIN;
  return Math.min(Math.max(px, RIGHT_AREA_MIN), RIGHT_AREA_MAX);
}

export function shellWindowCanHoldLeftRail(windowPx: number): boolean {
  return normalizeWindowPx(windowPx) >= MAIN_AREA_MIN + SIDEBAR_LEFT_MIN;
}

export function shellGeometriesEqual(a: ShellGeometry, b: ShellGeometry): boolean {
  return (
    a.leftPx === b.leftPx
    && a.centerPx === b.centerPx
    && a.rightPx === b.rightPx
    && a.rightMode === b.rightMode
    && a.leftWindowCollapsed === b.leftWindowCollapsed
    && a.leftPinToMin === b.leftPinToMin
  );
}

export function computeShellGeometry(input: ShellGeometryInput): ShellGeometry {
  const windowPx = normalizeWindowPx(input.windowPx);
  const rightYieldEnabled = input.rightYieldEnabled !== false;

  // Live sash only. Pointer-up persists preferred px and water-fills without these.
  if (input.sashLeftPx != null || input.sashRightPx != null) {
    return placeWithSash(windowPx, input, rightYieldEnabled);
  }

  if (!input.leftUserExpanded) {
    return finishLeft(
      windowPx,
      { leftPx: 0, leftWindowCollapsed: false, leftPinToMin: false },
      input,
      rightYieldEnabled,
    );
  }

  if (input.leftWindowCollapsed) {
    if (shellWindowCanHoldLeftRail(windowPx)) {
      return finishLeft(
        windowPx,
        { leftPx: SIDEBAR_LEFT_MIN, leftWindowCollapsed: false, leftPinToMin: true },
        input,
        rightYieldEnabled,
      );
    }
    return finishLeft(
      windowPx,
      { leftPx: 0, leftWindowCollapsed: true, leftPinToMin: true },
      input,
      rightYieldEnabled,
    );
  }

  if (input.rightMode === "split" && rightYieldEnabled) {
    return placeWorkspaceSplit(windowPx, input);
  }

  return placeLeftThenInner(windowPx, input, rightYieldEnabled);
}

function preferredLeft(input: ShellGeometryInput): number {
  return input.leftPinToMin ? SIDEBAR_LEFT_MIN : clampShellLeftPreferredPx(input.leftPreferredPx);
}

function placeLeftSolo(
  windowPx: number,
  input: ShellGeometryInput,
): Pick<ShellGeometry, "leftPx" | "leftWindowCollapsed" | "leftPinToMin"> {
  const preferred = preferredLeft(input);

  if (windowPx >= preferred + MAIN_AREA_MIN) {
    return {
      leftPx: preferred,
      leftWindowCollapsed: false,
      leftPinToMin: input.leftPinToMin,
    };
  }
  if (windowPx >= SIDEBAR_LEFT_MIN + MAIN_AREA_MIN) {
    return {
      leftPx: windowPx - MAIN_AREA_MIN,
      leftWindowCollapsed: false,
      leftPinToMin: false,
    };
  }
  if (input.crampedLeftAllowed) {
    return {
      leftPx: Math.min(preferred, windowPx),
      leftWindowCollapsed: false,
      leftPinToMin: false,
    };
  }
  return { leftPx: 0, leftWindowCollapsed: true, leftPinToMin: true };
}

function placeLeftThenInner(
  windowPx: number,
  input: ShellGeometryInput,
  rightYieldEnabled: boolean,
): ShellGeometry {
  return finishLeft(windowPx, placeLeftSolo(windowPx, input), input, rightYieldEnabled);
}

function finishLeft(
  windowPx: number,
  left: Pick<ShellGeometry, "leftPx" | "leftWindowCollapsed" | "leftPinToMin">,
  input: ShellGeometryInput,
  rightYieldEnabled: boolean,
): ShellGeometry {
  const mainPx = Math.max(0, windowPx - left.leftPx);
  const inner = placeInner(mainPx, input.rightMode, input.rightPreferredPx, rightYieldEnabled);
  return {
    ...left,
    centerPx: inner.centerPx,
    rightPx: inner.rightPx,
    rightMode: inner.rightMode,
  };
}

function placeInner(
  mainPx: number,
  rightMode: ShellRightMode,
  rightPreferredPx: number,
  rightYieldEnabled: boolean,
): Pick<ShellGeometry, "centerPx" | "rightPx" | "rightMode"> {
  const main = Math.max(0, mainPx);
  if (rightMode === "maximize") {
    return { centerPx: 0, rightPx: main, rightMode: "maximize" };
  }
  if (rightMode === "closed") {
    return { centerPx: main, rightPx: 0, rightMode: "closed" };
  }

  const preferred = clampShellRightPreferredPx(rightPreferredPx);

  if (!rightYieldEnabled) {
    if (main >= MAIN_AREA_MIN + RIGHT_AREA_MIN) {
      const rightPx = Math.min(preferred, main - MAIN_AREA_MIN);
      return { centerPx: main - rightPx, rightPx, rightMode: "split" };
    }
    return { centerPx: 0, rightPx: main, rightMode: "maximize" };
  }

  if (main >= preferred + MAIN_AREA_MIN) {
    return { centerPx: main - preferred, rightPx: preferred, rightMode: "split" };
  }
  if (main >= RIGHT_AREA_MIN + MAIN_AREA_MIN) {
    return { centerPx: MAIN_AREA_MIN, rightPx: main - MAIN_AREA_MIN, rightMode: "split" };
  }
  return { centerPx: main, rightPx: 0, rightMode: "closed" };
}

function placeWorkspaceSplit(windowPx: number, input: ShellGeometryInput): ShellGeometry {
  const leftPreferred = preferredLeft(input);
  const rightPreferred = clampShellRightPreferredPx(input.rightPreferredPx);
  const needed = leftPreferred + rightPreferred + MAIN_AREA_MIN;

  if (windowPx >= needed) {
    return {
      leftPx: leftPreferred,
      centerPx: windowPx - leftPreferred - rightPreferred,
      rightPx: rightPreferred,
      rightMode: "split",
      leftWindowCollapsed: false,
      leftPinToMin: input.leftPinToMin,
    };
  }

  const leftRoom = leftPreferred - SIDEBAR_LEFT_MIN;
  const rightRoom = rightPreferred - RIGHT_AREA_MIN;
  const yieldRoom = leftRoom + rightRoom;
  const squeeze = needed - windowPx;

  if (yieldRoom > 0 && squeeze <= yieldRoom) {
    const takeLeft = squeeze * (leftRoom / yieldRoom);
    const leftPx = Math.round(leftPreferred - takeLeft);
    return {
      leftPx,
      centerPx: MAIN_AREA_MIN,
      rightPx: windowPx - leftPx - MAIN_AREA_MIN,
      rightMode: "split",
      leftWindowCollapsed: false,
      leftPinToMin: false,
    };
  }

  if (windowPx >= SIDEBAR_LEFT_MIN + MAIN_AREA_MIN) {
    return {
      leftPx: SIDEBAR_LEFT_MIN,
      centerPx: windowPx - SIDEBAR_LEFT_MIN,
      rightPx: 0,
      rightMode: "closed",
      leftWindowCollapsed: false,
      leftPinToMin: true,
    };
  }

  if (input.crampedLeftAllowed) {
    const leftPx = Math.min(leftPreferred, windowPx);
    return {
      leftPx,
      centerPx: windowPx - leftPx,
      rightPx: 0,
      rightMode: "closed",
      leftWindowCollapsed: false,
      leftPinToMin: false,
    };
  }

  return {
    leftPx: 0,
    centerPx: windowPx,
    rightPx: 0,
    rightMode: "closed",
    leftWindowCollapsed: true,
    leftPinToMin: true,
  };
}

function placeWithSash(
  windowPx: number,
  input: ShellGeometryInput,
  rightYieldEnabled: boolean,
): ShellGeometry {
  let leftPx: number;
  let leftWindowCollapsed = false;
  let leftPinToMin = false;

  if (input.sashLeftPx != null) {
    leftPx = input.sashLeftPx <= 0.5 ? 0 : clampShellLeftPreferredPx(input.sashLeftPx);
  } else if (!input.leftUserExpanded) {
    leftPx = 0;
  } else if (input.leftWindowCollapsed) {
    if (shellWindowCanHoldLeftRail(windowPx)) {
      leftPx = SIDEBAR_LEFT_MIN;
      leftPinToMin = true;
    } else {
      leftPx = 0;
      leftWindowCollapsed = true;
      leftPinToMin = true;
    }
  } else {
    leftPx = preferredLeft(input);
    leftPinToMin = input.leftPinToMin;
  }

  const mainPx = Math.max(0, windowPx - leftPx);

  if (input.rightMode === "maximize" && input.sashRightPx == null) {
    return {
      leftPx,
      centerPx: 0,
      rightPx: mainPx,
      rightMode: "maximize",
      leftWindowCollapsed,
      leftPinToMin,
    };
  }

  if (input.sashRightPx != null) {
    if (input.sashRightPx <= 0.5) {
      return {
        leftPx,
        centerPx: mainPx,
        rightPx: 0,
        rightMode: "closed",
        leftWindowCollapsed,
        leftPinToMin,
      };
    }
    const requested = Math.min(Math.max(0, Math.round(input.sashRightPx)), mainPx);
    const rawCenter = mainPx - requested;
    if (rawCenter > MAIN_AREA_MIN) {
      return {
        leftPx,
        centerPx: rawCenter,
        rightPx: requested,
        rightMode: "split",
        leftWindowCollapsed,
        leftPinToMin,
      };
    }
    if (rawCenter > MAIN_AREA_MIN - SHELL_SASH_DETENT_ARM_PX) {
      const rightPx = Math.max(0, mainPx - MAIN_AREA_MIN);
      return {
        leftPx,
        centerPx: Math.min(MAIN_AREA_MIN, mainPx),
        rightPx,
        rightMode: "split",
        leftWindowCollapsed,
        leftPinToMin,
      };
    }
    return {
      leftPx,
      centerPx: 0,
      rightPx: mainPx,
      rightMode: "maximize",
      leftWindowCollapsed,
      leftPinToMin,
    };
  }

  const inner = placeInner(mainPx, input.rightMode, input.rightPreferredPx, rightYieldEnabled);
  return {
    leftPx,
    centerPx: inner.centerPx,
    rightPx: inner.rightPx,
    rightMode: inner.rightMode,
    leftWindowCollapsed,
    leftPinToMin,
  };
}

function normalizeWindowPx(windowPx: number): number {
  if (!Number.isFinite(windowPx)) return 0;
  return Math.max(0, Math.round(windowPx));
}

/**
 * Paper widths ignore the 1px sashes. Fit `#center` / `#right-area` into
 * `#main-area` so the Right title-bar hit fills share the window-edge paint
 * layer's right edge (otherwise hover/selected sit 1–2px off the glyphs).
 *
 * Closed hides the right sash (`0`); split and maximize keep it (`1`) so
 * clicking maximize does not jump the cluster by a pixel.
 */
export function fitMainAreaColumns(
  geo: Pick<ShellGeometry, "centerPx" | "rightPx" | "rightMode">,
): { centerW: number; rightW: number; rightSashPx: 0 | 1 } {
  const maximized = geo.rightMode === "maximize";
  const rightClosed = geo.rightMode === "closed";
  return {
    centerW: Math.max(0, geo.centerPx - (rightClosed ? 1 : maximized ? 0 : 2)),
    rightW: Math.max(0, geo.rightPx - (maximized ? 2 : 0)),
    rightSashPx: rightClosed ? 0 : 1,
  };
}
