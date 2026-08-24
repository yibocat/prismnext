import { useLayoutEffect, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  LEFT_SIDEBAR_SASH_SEPARATOR_CLASS,
  PANEL_SASH_SEPARATOR_CLASS,
  SHELL_SASH_SHADOW_LEFT_CLASS,
  SHELL_SASH_SHADOW_RIGHT_CLASS,
} from "@/lib/workspace/layout-constants";
import { stopLeftSidebarToggleAnimation } from "@/lib/workspace/left-sidebar-panel";
import { stopRightAreaToggleAnimation } from "@/lib/workspace/right-area-layout";
import { fitMainAreaColumns } from "@/lib/workspace/shell-geometry";
import {
  beginShellSashSession,
  commitShellSashSession,
  moveShellSashSession,
  useShellLive,
  watchShellWindowSize,
  type ShellSashRail,
} from "@/lib/workspace/shell-layout-controller";
import { useLayoutStore } from "@/stores/layout-store";

function ShellSash({
  rail,
  disabled,
  className,
}: {
  rail: ShellSashRail;
  disabled?: boolean;
  className?: string;
}) {
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    stopLeftSidebarToggleAnimation();
    stopRightAreaToggleAnimation();
    beginShellSashSession(rail, event.clientX);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    moveShellSashSession(rail, event.clientX);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    commitShellSashSession(rail, event.clientX);
  };

  const onLostPointerCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 0) {
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    finishPointer(event);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      data-shell-sash={rail}
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onLostPointerCapture={onLostPointerCapture}
    />
  );
}

export function ShellFrame({
  left,
  center,
  right,
  overlay,
}: {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  overlay?: ReactNode;
}) {
  const geo = useShellLive();
  const inSettings = useLayoutStore((s) => s.leftSidebarView === "settings");
  const settingsStacked = useLayoutStore((s) => s.settingsDetailStacked);
  const leftOpen = geo.leftPx >= 30;
  const rightOpen = geo.rightPx >= 30 || geo.rightMode === "maximize";
  const maximized = geo.rightMode === "maximize";
  const rightClosed = geo.rightMode === "closed";
  const rightSashDisabled = maximized || (inSettings && settingsStacked);
  const { centerW, rightW } = fitMainAreaColumns(geo);

  useLayoutEffect(() => watchShellWindowSize(), []);

  return (
    <div id="main-layout" className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        id="left-sidebar"
        className="shrink-0 overflow-hidden"
        style={{ width: geo.leftPx }}
      >
        {left}
      </div>
      <ShellSash
        rail="left"
        className={cn(
          LEFT_SIDEBAR_SASH_SEPARATOR_CLASS,
          leftOpen && SHELL_SASH_SHADOW_RIGHT_CLASS,
        )}
      />
      <div id="main-area" className="relative min-w-0 flex-1" data-surface="content">
        {overlay}
        <div id="center-right" className="flex h-full min-w-0 w-full overflow-hidden">
          <div
            id="center"
            className="min-w-0 shrink-0 overflow-hidden"
            style={{ width: centerW }}
          >
            {center}
          </div>
          <ShellSash
            rail="right"
            disabled={rightSashDisabled}
            className={cn(
              PANEL_SASH_SEPARATOR_CLASS,
              rightOpen && !maximized && SHELL_SASH_SHADOW_LEFT_CLASS,
              (maximized || rightClosed) && "pointer-events-none",
              rightClosed && "w-0",
            )}
          />
          <div
            id="right-area"
            className="min-w-0 shrink-0 overflow-hidden"
            style={{ width: rightW }}
          >
            {right}
          </div>
        </div>
      </div>
    </div>
  );
}
