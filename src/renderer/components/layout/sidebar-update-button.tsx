import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Hint } from "@/components/ui/hint";
import { useAvailableUpdate } from "@/hooks/use-available-update";
import { cn } from "@/lib/utils";

/**
 * Circular update chip — only visible when a newer build is available.
 * Lives to the right of Settings in the left sidebar footer.
 */
export function SidebarUpdateButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const {
    visible,
    latestVersion,
    downloading,
    busy,
    readyToInstall,
    oneClickUpdate,
  } = useAvailableUpdate();

  if (!visible) return null;

  const label = readyToInstall
    ? t("settings.about.restartToInstall")
    : latestVersion
      ? t("nav.updateToVersion", { version: latestVersion })
      : t("settings.about.oneClickUpdate");

  return (
    <Hint label={label} side="top" delayDuration={200}>
      <button
        type="button"
        aria-label={label}
        disabled={busy || downloading}
        onClick={() => void oneClickUpdate()}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full",
          "bg-primary text-primary-foreground shadow-sm",
          "transition-opacity hover:opacity-90",
          "disabled:opacity-70",
          className,
        )}
      >
        {busy || downloading ? (
          <Loader2Icon className="size-2.5 animate-spin" />
        ) : (
          <DownloadIcon className="size-2.5" />
        )}
      </button>
    </Hint>
  );
}
