import { useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLayoutStore } from "@/stores/layout-store";
import { useChatStore } from "@/stores/chat-store";
import { useWindowState } from "@/hooks/use-window-state";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import {
  MaximizeIcon,
  MinimizeIcon,
  PanelLeft,
  PanelRight,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { ServerStatusDot } from "@/components/server-status-dot";
import { toggleLeftSidebarPanel } from "@/lib/workspace/left-sidebar-panel";
import { isShellLeftOpen, useShellLive } from "@/lib/workspace/shell-layout-controller";
import {
  toggleRightArea,
  toggleRightAreaMaximize,
} from "@/lib/workspace/right-area-layout";

interface SidebarControlsProps {
  showMacSpacer?: boolean;
  className?: string;
  /** paint = glyphs only; hit = hover/selected fills (icons hidden in CSS). */
  layer?: "paint" | "hit";
}

const CHROME_BTN =
  "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-[color]";

export function SidebarControls({
  showMacSpacer,
  className,
  layer = "hit",
}: SidebarControlsProps) {
  const { t } = useTranslation();
  const leftOpen = isShellLeftOpen(useShellLive());
  const setCommandPaletteOpen = useLayoutStore((s) => s.setCommandPaletteOpen);
  const newSession = useChatStore((s) => s.newSession);
  const paint = layer === "paint";

  return (
    <div className={cn("flex items-center", className)}>
      <div className="flex items-center gap-1">
        {showMacSpacer && <div className="pointer-events-none w-[68px]" />}

        <Hint shortcutId="shell.toggleLeftSidebar">
          <button
            type="button"
            className={cn(
              CHROME_BTN,
              paint
                ? "bg-transparent"
                : cn(
                    "hover:bg-accent hover:text-accent-foreground",
                    leftOpen && "bg-muted text-foreground",
                  ),
            )}
            onClick={() => toggleLeftSidebarPanel()}
            tabIndex={paint ? -1 : undefined}
          >
            <PanelLeft className="size-3.5" />
          </button>
        </Hint>

        <Hint shortcutId="shell.commandPalette">
          <button
            type="button"
            className={cn(
              CHROME_BTN,
              paint ? "bg-transparent" : "hover:bg-accent hover:text-accent-foreground",
            )}
            onClick={() => setCommandPaletteOpen(true)}
            tabIndex={paint ? -1 : undefined}
          >
            <SearchIcon className="size-3.5" />
          </button>
        </Hint>
      </div>

      <div data-pinned-new-agent="">
        <Hint label={t("shell.newAgent")} shortcutId="product.newChat">
          <button
            type="button"
            className={cn(
              CHROME_BTN,
              paint ? "bg-transparent" : "hover:bg-accent hover:text-accent-foreground",
            )}
            onClick={() => newSession()}
            tabIndex={paint ? -1 : undefined}
          >
            <PlusIcon className="size-3.5" />
          </button>
        </Hint>
      </div>
    </div>
  );
}

/**
 * The visible status dot. Always mounted on #main-area (same pattern as
 * LeftSidebarPinnedChrome). ContentTopBar / RightArea only keep hit targets.
 *
 * Do not mount this only when RightArea is maximized: that unmounts
 * ContentTopBar and creates a new glyph in the same commit — the vertical jump.
 */
export function StatusDotPinnedChrome() {
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  if (leftSidebarView === "settings") return null;

  return (
    <div
      data-pinned-status-dot=""
      className="pointer-events-none absolute left-0 top-0 z-30 flex h-[var(--height-titlebar)] items-center gap-0.5 px-2"
      aria-hidden
    >
      {/* Width only — do not mount hit chrome here. That copy was
          re-enabling pointer-events on + and painting hover without a glyph. */}
      <div data-content-sidebar-spacer="" />
      <div className="ml-0.5 flex size-5 items-center justify-center">
        <ServerStatusDot layer="paint" />
      </div>
    </div>
  );
}

/** Window-fixed cluster: traffic-light gap + toggle + search (+ appears on collapse). */
export function LeftSidebarPinnedChrome() {
  const { platform, isFullscreen } = useWindowState();
  const showMacSpacer = platform === "darwin" && !isFullscreen;

  useLayoutEffect(() => {
    document.documentElement.toggleAttribute("data-fullscreen", isFullscreen);
  }, [isFullscreen]);

  return (
    <div
      data-left-sidebar-pinned-chrome=""
      className="pointer-events-none absolute left-0 top-0 z-30 flex h-[var(--height-titlebar)] items-center px-2"
      aria-hidden
    >
      <SidebarControls showMacSpacer={showMacSpacer} layer="paint" />
    </div>
  );
}

/** Invisible hit targets inside a title-bar drag-region. */
export function SidebarHitChrome({
  className,
}: {
  className?: string;
}) {
  const { platform, isFullscreen } = useWindowState();
  const showMacSpacer = platform === "darwin" && !isFullscreen;
  return (
    <div data-sidebar-hit-chrome="">
      <SidebarControls
        showMacSpacer={showMacSpacer}
        className={className}
      />
    </div>
  );
}

/**
 * Invisible hit targets inside a title-bar drag-region.
 * Electron only honors no-drag on descendants of drag — the paint overlay cannot receive clicks.
 */
export function ContentSidebarSpacer() {
  return (
    <div data-content-sidebar-spacer="">
      <SidebarHitChrome className="-ml-px" />
    </div>
  );
}

function RightAreaChromeControls({
  layer = "hit",
}: { layer?: "paint" | "hit" }) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const paint = layer === "paint";

  const layoutCtx = () => ({ isMobile });

  return (
    <div className="flex items-center">
      <div data-pinned-right-extra="">
        <Hint
          label={
            editorMaximized
              ? t("shell.rightArea.restorePanel")
              : t("shell.rightArea.maximizePanel")
          }
        >
          <button
            type="button"
            className={cn(
              CHROME_BTN,
              paint ? "bg-transparent" : "hover:bg-accent hover:text-accent-foreground",
            )}
            onClick={() => toggleRightAreaMaximize(layoutCtx())}
            tabIndex={paint ? -1 : undefined}
          >
            {editorMaximized ? <MinimizeIcon className="size-3.5" /> : <MaximizeIcon className="size-3.5" />}
          </button>
        </Hint>
      </div>
      <Hint shortcutId="shell.toggleRightArea">
        <button
          type="button"
          className={cn(
            CHROME_BTN,
            paint
              ? "bg-transparent"
              : cn(
                  "hover:bg-accent hover:text-accent-foreground",
                  rightAreaExpanded && "bg-muted text-foreground",
                ),
          )}
          onClick={() => toggleRightArea(layoutCtx())}
          tabIndex={paint ? -1 : undefined}
        >
          <PanelRight className="size-3.5" />
        </button>
      </Hint>
    </div>
  );
}

/** Window-fixed cluster: toggle stays put; maximize eases in when open. */
export function RightAreaPinnedChrome() {
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);

  if (leftSidebarView === "settings") return null;

  return (
    <div
      data-right-area-pinned-chrome=""
      className="pointer-events-none absolute right-0 top-0 z-30 flex h-[var(--height-titlebar)] items-center px-2"
      aria-hidden
    >
      <RightAreaChromeControls layer="paint" />
    </div>
  );
}

/** Invisible hit targets inside a title-bar drag-region. */
export function RightAreaHitChrome() {
  return (
    <div data-right-area-hit-chrome="" className="shrink-0">
      <RightAreaChromeControls />
    </div>
  );
}

/**
 * Content top-bar reservation for the pinned toggle.
 * Collapses when RightArea is open so the cluster lives on the window edge.
 */
export function ContentRightAreaSpacer() {
  return (
    <div data-content-right-spacer="">
      <RightAreaHitChrome />
    </div>
  );
}
