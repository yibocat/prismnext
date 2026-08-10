// ScopeChip — the ALWAYS-VISIBLE scope badge (design §8.0 UX2: scope is always
// shown, never a navigation axis). Opaque tokens only (theme iron rule).
import { GlobeIcon, FolderIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TeamScope } from "@shared/teams/types";

export function ScopeChip({ scope, className }: { scope: TeamScope; className?: string }) {
  const { t } = useTranslation();
  const isApp = scope === "app";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[length:var(--font-size-11)] font-medium",
        isApp ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground",
        className,
      )}
      title={isApp ? t("settings.teams.scope.appDesc") : t("settings.teams.scope.projectDesc")}
    >
      {isApp ? <GlobeIcon className="size-3" /> : <FolderIcon className="size-3" />}
      {isApp ? t("settings.teams.scope.app") : t("settings.teams.scope.project")}
    </span>
  );
}
