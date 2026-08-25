import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getRightAreaLauncherModes } from "@/lib/workspace/right-area-launcher-modes";
import { openMode } from "@/lib/workspace/open-right-area-mode";
import { getModeShortcutId } from "@/lib/workspace/mode-shortcuts";
import { ShortcutKbdChips, SHORTCUT_CHIPS_HOVER_REVEAL } from "@/lib/shortcuts";
import { appMenuFontClass } from "@/components/ui/app-menu";

/**
 * Empty RightArea — one column of flat mode cards (registry-driven).
 */
export function RightAreaLauncher() {
  const { t } = useTranslation();
  const modes = useMemo(() => getRightAreaLauncherModes(), []);

  const modeLabel = useCallback(
    (mode: { label: string; labelKey?: string }) =>
      mode.labelKey ? t(mode.labelKey) : mode.label,
    [t],
  );

  return (
    <div
      data-surface="content"
      data-right-area-launcher
      className="flex h-full min-h-0 items-center justify-center bg-background px-6 py-8"
    >
      <ul className="flex w-full max-w-[35rem] list-none flex-col gap-2.5 p-0 m-0">
        {modes.map((mode) => {
          const shortcutId = getModeShortcutId(mode.id);
          return (
            <li key={mode.id}>
              <button
                type="button"
                className={cn(
                  "group flex w-full min-h-12 items-center gap-2 rounded-lg border border-border bg-background px-3 text-left transition-[border-color]",
                  appMenuFontClass,
                  "text-foreground hover:border-foreground/30",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset",
                )}
                onClick={() => openMode(mode.id)}
              >
                <span
                  className="shrink-0 text-muted-foreground [&>svg]:size-3.5 [&>svg]:opacity-70"
                  aria-hidden
                >
                  {mode.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{modeLabel(mode)}</span>
                {shortcutId ? (
                  <ShortcutKbdChips
                    id={shortcutId}
                    className={cn("ml-auto shrink-0", SHORTCUT_CHIPS_HOVER_REVEAL)}
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
