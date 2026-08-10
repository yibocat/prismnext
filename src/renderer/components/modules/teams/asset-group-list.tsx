// AssetGroupList — the shared template for the Skills / Commands / MCP pages
// (design §8.4). Groups by owning team; group header carries ScopeChip +
// OriginChip + count; each row has a project-level tri-state switch, a
// BlockedHint (no fake toggles), and an OverrideDot.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import type { AssetViewV2 } from "@shared/teams/view";
import { CORE_TEAM_ID, LOCAL_TEAM_ID } from "@shared/teams/types";
import { ScopeChip } from "./scope-chip";
import { OriginChip } from "./origin-chip";
import { BlockedHint } from "./blocked-hint";
import { OverrideDot } from "./override-dot";

export interface AssetGroupListProps {
  assets: AssetViewV2[];
  /** Persist a project-level tri-state flip. value=null follows the app layer. */
  onSetEnabled: (fqid: string, enabled: boolean | null) => void;
  /** Optional per-row actions (edit / delete) for editable assets. */
  renderActions?: (asset: AssetViewV2) => React.ReactNode;
  /** Optional secondary line under the asset name. */
  renderMeta?: (asset: AssetViewV2) => React.ReactNode;
  emptyHint?: string;
  className?: string;
}

interface Group {
  teamId: string;
  teamName: string;
  scope: "app" | "project";
  source: AssetViewV2["origin"]["source"];
  tier: AssetViewV2["origin"]["tier"];
  assets: AssetViewV2[];
}

export function AssetGroupList({
  assets,
  onSetEnabled,
  renderActions,
  renderMeta,
  emptyHint,
  className,
}: AssetGroupListProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const a of assets) {
      const key = a.teamId;
      const entry = map.get(key) ?? {
        teamId: key,
        teamName: a.origin.teamName,
        scope: a.origin.scope,
        source: a.origin.source,
        tier: a.origin.tier,
        assets: [],
      };
      entry.assets.push(a);
      map.set(key, entry);
    }
    // core first, then app teams (alphabetical), then the project team last.
    const rank = (g: Group) =>
      g.teamId === CORE_TEAM_ID ? 0 : g.scope === "project" || g.teamId === LOCAL_TEAM_ID ? 2 : 1;
    return [...map.values()].sort(
      (a, b) => rank(a) - rank(b) || a.teamName.localeCompare(b.teamName),
    );
  }, [assets]);

  const toggleGroup = (teamId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  if (assets.length === 0) {
    return (
      <p className="py-8 text-center text-[length:var(--font-size-13)] text-muted-foreground">
        {emptyHint ?? t("settings.teams.assets.empty")}
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.teamId);
        return (
          <div key={group.teamId} className="rounded-md border border-border">
            <button
              type="button"
              onClick={() => toggleGroup(group.teamId)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
            >
              {isCollapsed ? (
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              ) : (
                <ChevronDownIcon className="size-4 text-muted-foreground" />
              )}
              <span className="truncate font-medium">{group.teamName}</span>
              <ScopeChip scope={group.scope} />
              <OriginChip source={group.source} tier={group.tier} />
              <span className="ml-auto text-[length:var(--font-size-11)] text-muted-foreground">
                {t("settings.teams.assets.count", { count: group.assets.length })}
              </span>
            </button>
            {!isCollapsed && (
              <div className="border-t border-border px-3 py-1.5">
                {group.assets.map((asset) => {
                  const overridden =
                    asset.enabledProject !== undefined &&
                    asset.enabledProject !== asset.enabledApp;
                  return (
                    <div key={asset.fqid} className="flex items-center gap-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "truncate font-mono text-[length:var(--font-size-13)]",
                              !asset.enabled && "text-muted-foreground",
                            )}
                          >
                            {asset.name}
                          </span>
                          <OverrideDot
                            overridden={overridden}
                            appValue={asset.enabledApp}
                            onReset={() => onSetEnabled(asset.fqid, null)}
                          />
                        </div>
                        {asset.blockedBy ? (
                          <BlockedHint blockedBy={asset.blockedBy} teamName={asset.origin.teamName} />
                        ) : (
                          renderMeta && <div className="text-[length:var(--font-size-11)] text-muted-foreground">{renderMeta(asset)}</div>
                        )}
                      </div>
                      {renderActions?.(asset)}
                      {asset.blockedBy && asset.blockedBy !== "asset-disabled-project" && asset.blockedBy !== "asset-disabled-app" ? (
                        // No fake toggle for license / not-installed / shadowed / etc.
                        <span className="w-9" />
                      ) : (
                        <Switch
                          checked={asset.enabled}
                          onCheckedChange={(v) => onSetEnabled(asset.fqid, v)}
                          aria-label={asset.name}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
