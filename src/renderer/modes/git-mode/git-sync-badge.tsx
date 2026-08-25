import { useTranslation } from "react-i18next";
import { Hint } from "@/components/ui/hint";
import { formatSyncBadgeLabel } from "@/lib/git/git-publish";
import { useGitStore } from "@/stores/git-store";
import { cn } from "@/lib/utils";

const badgeClass = cn(
  "flex items-center h-6 px-1.5 shrink-0 max-w-[9rem]",
  "text-[length:var(--font-menu-item)] text-muted-foreground tabular-nums",
);

export function GitSyncBadge({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const tracking = useGitStore((s) => s.tracking);
  const label = formatSyncBadgeLabel(tracking, compact, t);
  if (!label) return null;

  if (!tracking.hasRemote) {
    return (
      <Hint label={t("git.remoteAdd.badgeHint")}>
        <button
          type="button"
          className={cn(
            badgeClass,
            "truncate rounded hover:bg-transparent hover:text-foreground",
          )}
          onClick={() => useGitStore.getState().openAddRemote()}
        >
          {t("git.remoteAdd.title")}
        </button>
      </Hint>
    );
  }

  return (
    <Hint label={label.hint}>
      <span className={cn(badgeClass, "truncate")}>
        {label.text}
      </span>
    </Hint>
  );
}
