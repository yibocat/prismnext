// TeamPicker — the single ownership+scope selector (design §8.3, UX1: scope is
// never a separate control; the user picks a team and the team carries the scope).
// One control decides both ownership and scope. Read-only teams (built-in /
// Pro / registry) are excluded — you can't write into a read-only team.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TeamCardView } from "../../../stores/teams-store";

export interface TeamPickerProps {
  /** Writable teams (already filtered to editable). */
  teams: TeamCardView[];
  /** Selected teamId. */
  value: string | null;
  onChange: (teamId: string) => void;
  /** Create a new team at the given scope. */
  onCreateTeam?: (scope: "app" | "project") => void;
  className?: string;
}

export function TeamPicker({ teams, value, onChange, onCreateTeam, className }: TeamPickerProps) {
  const { t } = useTranslation();
  const selected = teams.find((tm) => tm.manifest.id === value) ?? null;

  const { projectTeams, appTeams } = useMemo(() => {
    const writable = teams.filter((tm) => tm.writable);
    return {
      projectTeams: writable.filter((tm) => tm.scope === "project"),
      appTeams: writable.filter((tm) => tm.scope === "app"),
    };
  }, [teams]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-[length:var(--font-size-13)] hover:bg-accent/50",
            className,
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <span className="truncate">{selected?.manifest.name ?? t("settings.teams.picker.placeholder")}</span>
            {selected && (
              <span className="shrink-0 text-[length:var(--font-size-11)] text-muted-foreground">
                {selected.scope === "app" ? t("settings.teams.scope.app") : t("settings.teams.scope.project")}
              </span>
            )}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{t("settings.teams.picker.projectGroup")}</DropdownMenuLabel>
        {projectTeams.map((tm) => (
          <DropdownMenuItem key={tm.manifest.id} onClick={() => onChange(tm.manifest.id)}>
            <CheckIcon className={cn("size-4", value === tm.manifest.id ? "opacity-100" : "opacity-0")} />
            <span className="truncate">{tm.manifest.name}</span>
            <span className="ml-auto text-[length:var(--font-size-11)] text-muted-foreground">
              {t("settings.teams.scope.project")}
            </span>
          </DropdownMenuItem>
        ))}
        {onCreateTeam && (
          <DropdownMenuItem onClick={() => onCreateTeam("project")}>
            <PlusIcon className="size-4" />
            {t("settings.teams.picker.newProjectTeam")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("settings.teams.picker.appGroup")}</DropdownMenuLabel>
        {appTeams.map((tm) => (
          <DropdownMenuItem key={tm.manifest.id} onClick={() => onChange(tm.manifest.id)}>
            <CheckIcon className={cn("size-4", value === tm.manifest.id ? "opacity-100" : "opacity-0")} />
            <span className="truncate">{tm.manifest.name}</span>
            <span className="ml-auto text-[length:var(--font-size-11)] text-muted-foreground">
              {t("settings.teams.scope.app")}
            </span>
          </DropdownMenuItem>
        ))}
        {onCreateTeam && (
          <DropdownMenuItem onClick={() => onCreateTeam("app")}>
            <PlusIcon className="size-4" />
            {t("settings.teams.picker.newAppTeam")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
