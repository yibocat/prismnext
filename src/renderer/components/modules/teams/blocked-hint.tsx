// BlockedHint — translates a BlockReason into an explanation + a way out
// (design §8.0 UX3: any greyed-out switch must say why). No fake toggles.
import { useTranslation } from "react-i18next";
import type { BlockReason } from "@shared/teams/types";

/**
 * The human-readable reason an asset/team is unavailable, plus an optional
 * action label for the way out. Returns null when there's nothing to explain.
 */
export function BlockedHint({
  blockedBy,
  teamName,
  className,
  action,
}: {
  blockedBy?: BlockReason | "out-of-scope";
  /** Owning team name (for shadowed / team-disabled messages). */
  teamName?: string;
  className?: string;
  /** Optional way-out action (e.g. "Go activate", "Enable this team"). */
  action?: { label: string; onClick: () => void };
}) {
  const { t } = useTranslation();
  if (!blockedBy) return null;

  const message = (() => {
    switch (blockedBy) {
      case "not-installed":
        return t("settings.teams.blocked.notInstalled");
      case "license":
        return t("settings.teams.blocked.license");
      case "incompatible":
        return t("settings.teams.blocked.incompatible");
      case "team-disabled-app":
        return t("settings.teams.blocked.teamDisabledApp", { team: teamName ?? "" });
      case "team-disabled-project":
        return t("settings.teams.blocked.teamDisabledProject", { team: teamName ?? "" });
      case "asset-disabled-app":
        return t("settings.teams.blocked.assetDisabledApp");
      case "asset-disabled-project":
        return t("settings.teams.blocked.assetDisabledProject");
      case "shadowed":
        return t("settings.teams.blocked.shadowed", { team: teamName ?? "" });
      case "out-of-scope":
        return t("settings.teams.blocked.outOfScope");
      default:
        return null;
    }
  })();
  if (!message) return null;

  return (
    <span className={className}>
      <span className="text-[length:var(--font-size-11)] text-muted-foreground">{message}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="ml-1.5 text-[length:var(--font-size-11)] text-primary hover:underline"
        >
          {action.label}
        </button>
      )}
    </span>
  );
}
