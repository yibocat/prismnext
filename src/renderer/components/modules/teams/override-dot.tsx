// OverrideDot — the "·overridden" indicator (design §8.2): shown when the
// project enable flag meaningfully diverges from the effective app/default
// value (see isProjectEnableOverridden). Hover explains; click offers
// "follow the global setting". VSCode-settings parity (existing user mental model).
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function OverrideDot({
  overridden,
  appValue,
  onReset,
  className,
}: {
  /** Whether the project value differs from the app value. */
  overridden: boolean;
  /** The app-level value (for the tooltip explanation). */
  appValue?: boolean;
  /** Reset to "follow the global setting" (delete the project key). */
  onReset?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!overridden) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onReset}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[length:var(--font-size-11)] text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            className,
          )}
          aria-label={t("settings.teams.override.ariaLabel")}
        >
          <span className="size-1.5 rounded-full bg-primary" />
          {t("settings.teams.override.label")}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {t("settings.teams.override.tooltip", {
          global: appValue === undefined
            ? t("settings.teams.override.globalDefault")
            : appValue
              ? t("settings.teams.override.globalOn")
              : t("settings.teams.override.globalOff"),
        })}
      </TooltipContent>
    </Tooltip>
  );
}
