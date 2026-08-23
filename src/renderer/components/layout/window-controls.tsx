import { useTranslation } from "react-i18next";
import { useWindowState } from "@/hooks/use-window-state";
import { shellDesktop } from "@/lib/desktop-api/shell";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import {
  MinusIcon,
  SquareIcon,
  CopyIcon,
  XIcon,
} from "lucide-react";

interface WindowControlsProps {
  className?: string;
  buttonClassName?: string;
  iconSizeClassName?: string;
}

/**
 * Standard Windows / Linux window titlebar controls: Minimize, Maximize/Restore, Close.
 * Hidden on macOS (macOS uses native traffic lights on the top left).
 * Always place this at the trailing edge (far right) of titlebars/toolbars.
 */
export function WindowControls({
  className,
  buttonClassName = "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-[color]",
  iconSizeClassName = "size-3.5",
}: WindowControlsProps) {
  const { t } = useTranslation();
  const { platform, isMaximized } = useWindowState();

  if (platform === "darwin") return null;

  return (
    <div className={cn("no-drag flex items-center gap-0.5 shrink-0", className)} data-window-controls>
      <Hint label={t("shell.minimize")}>
        <button
          type="button"
          className={buttonClassName}
          onClick={() => void shellDesktop.windowMinimize()}
          aria-label={t("shell.minimize")}
        >
          <MinusIcon className={iconSizeClassName} />
        </button>
      </Hint>

      <Hint label={isMaximized ? t("shell.restore") : t("shell.maximize")}>
        <button
          type="button"
          className={buttonClassName}
          onClick={() => void shellDesktop.windowMaximize()}
          aria-label={isMaximized ? t("shell.restore") : t("shell.maximize")}
        >
          {isMaximized ? (
            <CopyIcon className="size-3" />
          ) : (
            <SquareIcon className="size-3" />
          )}
        </button>
      </Hint>

      <Hint label={t("shell.close")}>
        <button
          type="button"
          className={cn(
            buttonClassName,
            "hover:bg-destructive hover:text-destructive-foreground active:bg-destructive/90",
          )}
          onClick={() => void shellDesktop.windowClose()}
          aria-label={t("shell.close")}
        >
          <XIcon className={iconSizeClassName} />
        </button>
      </Hint>
    </div>
  );
}
