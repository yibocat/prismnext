// RosterEditor — the lead agent's roster (design §8.2): which subagents this
// lead can delegate to. "All available" or an explicit list. Members from any
// team can be referenced (N5); cross-scope references are flagged, not errored.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import type { AssetViewV2, RosterView } from "@shared/teams/view";
import { ScopeChip } from "./scope-chip";
import { OriginChip } from "./origin-chip";

export interface RosterEditorProps {
  /** The current roster view (from teams:getRoster). */
  roster: RosterView | null;
  /** All subagents visible in this project (candidates for the list). */
  subagents: AssetViewV2[];
  /** The team this roster belongs to. */
  teamId: string;
  onChange: (next: { mode: "all" } | { mode: "list"; members: string[] }) => void;
  className?: string;
}

export function RosterEditor({ roster, subagents, teamId, onChange, className }: RosterEditorProps) {
  const { t } = useTranslation();
  const mode = roster?.spec.mode ?? "all";
  const memberFqids = useMemo(
    () => new Set(roster?.spec.mode === "list" ? roster.spec.members.filter((m) => m !== "@team") : []),
    [roster],
  );
  const hasTeamRef = roster?.spec.mode === "list" && roster.spec.members.includes("@team");

  const toggle = (fqid: string, checked: boolean) => {
    const next = new Set(memberFqids);
    if (checked) next.add(fqid);
    else next.delete(fqid);
    onChange({ mode: "list", members: [...next] });
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-4 text-[length:var(--font-size-13)]">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={mode === "all"}
            onChange={() => onChange({ mode: "all" })}
            className="accent-primary"
          />
          {t("settings.teams.roster.allAvailable")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={mode === "list"}
            onChange={() =>
              onChange({ mode: "list", members: [...memberFqids] })
            }
            className="accent-primary"
          />
          {t("settings.teams.roster.specificList")}
        </label>
      </div>

      {mode === "list" && (
        <div className="space-y-1 rounded-md border border-border p-2">
          {subagents.map((s) => {
            const checked = memberFqids.has(s.fqid) || (hasTeamRef && s.teamId === teamId);
            const outOfScope = s.origin.scope === "project" && s.teamId !== teamId;
            return (
              <div key={s.fqid} className="flex items-center gap-2 py-0.5">
                <Checkbox
                  checked={checked}
                  disabled={!s.enabled}
                  onCheckedChange={(v) => toggle(s.fqid, v === true)}
                />
                <span className={cn("truncate text-[length:var(--font-size-13)]", !s.enabled && "text-muted-foreground")}>
                  {s.name}
                </span>
                <OriginChip source={s.origin.source} tier={s.origin.tier} />
                <ScopeChip scope={s.origin.scope} />
                {outOfScope && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[length:var(--font-size-11)] text-warning">
                    <AlertTriangleIcon className="size-3" />
                    {t("settings.teams.roster.crossScope")}
                  </span>
                )}
              </div>
            );
          })}
          {subagents.length === 0 && (
            <p className="py-2 text-center text-[length:var(--font-size-12)] text-muted-foreground">
              {t("settings.teams.roster.empty")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
