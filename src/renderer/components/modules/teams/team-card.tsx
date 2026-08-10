// TeamCard — the shared team card (design §8.1: the marketplace and the
// settings page share components and copy — the same concept has the same name
// on both surfaces). Opaque tokens only (theme iron rule).
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TeamCardView } from "../../../stores/teams-store";
import { PackIcon } from "./team-icon";
import { ScopeChip } from "./scope-chip";
import { OriginChip } from "./origin-chip";

export interface TeamCardProps {
  team: TeamCardView;
  /** Whether this team is the active one (drives the "Active" pill). */
  isActive?: boolean;
  /** Trailing content (a switch, an install button, a menu). */
  trailing?: React.ReactNode;
  onClick?: () => void;
  expanded?: boolean;
  className?: string;
}

export function TeamCard({ team, isActive, trailing, onClick, expanded, className }: TeamCardProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card",
        !team.enabled && "opacity-60",
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted"
        aria-expanded={expanded}
      >
        <PackIcon size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{team.manifest.name}</span>
            <ScopeChip scope={team.scope} />
            <OriginChip source={team.source} tier={team.manifest.tier} />
            {team.manifest.version && team.source !== "core" && team.scope !== "project" && (
              <span className="text-[length:var(--font-size-11)] text-muted-foreground">
                v{team.manifest.version}
              </span>
            )}
            {isActive && (
              <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[length:var(--font-size-11)] font-medium text-secondary-foreground">
                {t("settings.teams.card.active")}
              </span>
            )}
          </div>
          <p className="truncate text-[length:var(--font-size-12)] text-muted-foreground">
            {team.manifest.description}
          </p>
        </div>
        {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
      </button>
    </div>
  );
}
