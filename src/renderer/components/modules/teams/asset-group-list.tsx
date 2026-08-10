// AssetGroupList — the shared template for the Skills / Commands / MCP pages
// (design §8.4). Built ENTIRELY on the app's existing Settings design tokens
// (SETTINGS_CARD / SETTINGS_ROW / SETTINGS_ROW_LABEL / SETTINGS_ROW_DESC /
// SETTINGS_CATEGORY_HEADER) — NOT hand-crafted CSS. This ensures visual
// parity with appearance-settings, skills-settings, and every other Settings
// page in the app.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import type { AssetViewV2 } from "@shared/teams/view";
import { CORE_TEAM_ID } from "@shared/teams/types";
import {
  SETTINGS_CARD as CARD,
  SETTINGS_ROW as ROW,
  SETTINGS_ROW_LABEL as ROW_LABEL,
  SETTINGS_ROW_DESC as ROW_DESC,
  SETTINGS_CATEGORY_HEADER as CATEGORY_HEADER,
} from "../settings/settings-tokens";
import { ScopeChip } from "./scope-chip";
import { OriginChip } from "./origin-chip";
import { BlockedHint } from "./blocked-hint";
import { OverrideDot } from "./override-dot";

const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";

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
  const [expanded, setExpanded] = useState<string | null>(null);

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
    const rank = (g: Group) =>
      g.teamId === CORE_TEAM_ID ? 0 : g.scope === "project" ? 2 : 1;
    return [...map.values()].sort(
      (a, b) => rank(a) - rank(b) || a.teamName.localeCompare(b.teamName),
    );
  }, [assets]);

  if (assets.length === 0) {
    return (
      <div className={cn(CARD, "!divide-y-0")}>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-[length:var(--font-size-13)] text-muted-foreground">
            {emptyHint ?? t("settings.teams.assets.empty")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {groups.map((group) => {
        const isOpen = expanded === group.teamId;
        return (
          <div key={group.teamId} className={cn(CARD, "!divide-y-0 overflow-hidden")}>
            {/* Group header — same density as a SETTINGS_ROW, with Chevron toggle */}
            <button
              type="button"
              className="flex w-full items-center gap-2 py-2.5 pl-2 pr-4 text-left"
              onClick={() => setExpanded(isOpen ? null : group.teamId)}
            >
              <span className="shrink-0 text-muted-foreground">
                {isOpen ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
              </span>
              <span className={cn(ROW_LABEL, "truncate")}>{group.teamName}</span>
              <ScopeChip scope={group.scope} />
              <OriginChip source={group.source} tier={group.tier} />
              <span className="ml-auto text-[length:var(--font-size-11)] text-muted-foreground tabular-nums shrink-0">
                {t("settings.teams.assets.count", { count: group.assets.length })}
              </span>
            </button>

            {/* Rows — same density as SETTINGS_ROW, divide-y like every Settings card */}
            {isOpen && (
              <div className="divide-y divide-border">
                {group.assets.map((asset) => {
                  const overridden =
                    asset.enabledProject !== undefined &&
                    asset.enabledProject !== asset.enabledApp;
                  return (
                    <div key={asset.fqid} className={cn(ROW, !asset.enabled && "opacity-60")}>
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn(ROW_LABEL, "font-mono")}>{asset.name}</span>
                          <OverrideDot
                            overridden={overridden}
                            appValue={asset.enabledApp}
                            onReset={() => onSetEnabled(asset.fqid, null)}
                          />
                        </div>
                        {asset.blockedBy ? (
                          <p className={ROW_DESC}>
                            <BlockedHint blockedBy={asset.blockedBy} teamName={asset.origin.teamName} />
                          </p>
                        ) : (
                          <>
                            <p className={ROW_DESC}>{asset.description}</p>
                            {renderMeta && (
                              <p className={cn(ROW_DESC, "!mt-0.5")}>{renderMeta(asset)}</p>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {renderActions?.(asset)}
                        {asset.blockedBy && asset.blockedBy !== "asset-disabled-project" && asset.blockedBy !== "asset-disabled-app" ? (
                          <span className="w-9" />
                        ) : (
                          <Switch
                            checked={asset.enabled}
                            onCheckedChange={(v) => onSetEnabled(asset.fqid, v)}
                            aria-label={asset.name}
                          />
                        )}
                      </div>
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
