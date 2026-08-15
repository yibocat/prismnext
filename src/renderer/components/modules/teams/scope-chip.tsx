// ScopeChip — scope hint (design §8.0 UX2: scope is shown, never a nav axis).
// Opaque tokens only (theme iron rule).
import { GlobeIcon, FolderIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TeamScope } from "@shared/teams/types";

export function ScopeChip({
  scope,
  className,
  /** Settings list: muted text only — no pill fill / icon. */
  quiet = false,
}: {
  scope: TeamScope;
  className?: string;
  quiet?: boolean;
}) {
  const { t } = useTranslation();
  const isApp = scope === "app";
  const label = isApp ? t("settings.teams.scope.app") : t("settings.teams.scope.project");
  const title = isApp ? t("settings.teams.scope.appDesc") : t("settings.teams.scope.projectDesc");
  if (quiet) {
    return (
      <span
        className={cn(
          "text-[length:var(--font-size-11)] text-muted-foreground shrink-0",
          className,
        )}
        title={title}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[length:var(--font-size-11)] font-medium",
        isApp ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground",
        className,
      )}
      title={title}
    >
      {isApp ? <GlobeIcon className="size-3" /> : <FolderIcon className="size-3" />}
      {label}
    </span>
  );
}
