// OriginChip — team name + source badge (built-in / official / Pro / mine).
// Opaque tokens only (theme iron rule).
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TeamSource } from "@shared/teams/types";

export function OriginChip({
  source,
  tier,
  className,
}: {
  source: TeamSource;
  tier?: "free" | "pro";
  className?: string;
}) {
  const { t } = useTranslation();
  const label =
    source === "core"
      ? t("settings.teams.origin.builtin")
      : source === "bundled"
        ? t("settings.teams.origin.official")
        : source === "pro"
          ? t("settings.teams.origin.pro")
          : source === "registry"
            ? t("settings.teams.origin.registry")
            : t("settings.teams.origin.mine");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[length:var(--font-size-11)] font-medium",
        tier === "pro"
          ? "bg-accent text-accent-foreground"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
