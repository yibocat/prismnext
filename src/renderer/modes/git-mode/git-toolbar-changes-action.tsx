import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUpFromLineIcon,
  ChevronDownIcon,
  GitCommitHorizontalIcon,
  GitMergeIcon,
  Loader2Icon,
} from "lucide-react";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { derivePushAction, derivePushLabel } from "@/lib/git/git-publish";
import { useGitStore } from "@/stores/git-store";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

export type GitToolbarChangesMode = "local" | "worktree";

interface GitToolbarChangesActionProps {
  mode: GitToolbarChangesMode;
  projectRoot: string;
  compact?: boolean;
  stagedCount: number;
  onMerge: () => void;
  onCommit: () => void;
}

const primaryBtnClass = cn(
  "flex items-center gap-1 px-2 transition-colors",
  "hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none",
);

const shellClass = cn(
  "flex shrink-0 items-stretch h-6 rounded-md overflow-hidden",
  "bg-primary text-primary-foreground text-[length:var(--font-menu-item)] font-medium shadow-sm",
);

/** Local: Commit | Push/Publish | menu. Worktree: single Merge to Branch. */
export function GitToolbarChangesAction({
  mode,
  projectRoot,
  compact,
  stagedCount,
  onMerge,
  onCommit,
}: GitToolbarChangesActionProps) {
  const { t } = useTranslation();
  const tracking = useGitStore((s) => s.tracking);
  const syncing = useGitStore((s) => s.syncing);
  const pushAction = derivePushAction(tracking);
  const pushLabel = derivePushLabel(tracking, {
    push: t("git.toolbar.push"),
    publish: t("git.toolbar.publish"),
  });
  const pushing = syncing === "push";

  const handlePush = useCallback(async () => {
    if (!projectRoot || syncing) return;
    await useGitStore.getState().pushRemote(projectRoot);
  }, [projectRoot, syncing]);

  if (mode === "worktree") {
    return (
      <Hint label={t("git.toolbar.mergeToBranch")}>
        <button
          type="button"
          onClick={onMerge}
          className={cn(shellClass, primaryBtnClass)}
        >
          <GitMergeIcon className="size-3.5 shrink-0" />
          {!compact && <span>{t("git.toolbar.mergeToBranch")}</span>}
        </button>
      </Hint>
    );
  }

  return (
    <div className={shellClass}>
      <Hint label={t("git.toolbar.commit")}>
        <button
          type="button"
          onClick={onCommit}
          disabled={stagedCount === 0}
          className={primaryBtnClass}
        >
          <GitCommitHorizontalIcon className="size-3.5 shrink-0" />
          {!compact && <span>{t("git.toolbar.commit")}</span>}
        </button>
      </Hint>

      {pushAction && pushLabel ? (
        <Hint label={pushLabel}>
          <button
            type="button"
            onClick={() => void handlePush()}
            disabled={Boolean(syncing)}
            className={cn(primaryBtnClass, "border-l border-primary-foreground/20")}
          >
            {pushing ? (
              <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
            ) : (
              <ArrowUpFromLineIcon className="size-3.5 shrink-0" />
            )}
            {!compact && <span>{pushLabel}</span>}
            {compact && pushAction.kind === "push" && pushAction.aheadCount > 0 ? (
              <span>↑{pushAction.aheadCount}</span>
            ) : null}
          </button>
        </Hint>
      ) : null}

      <AppMenu>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center justify-center w-6 border-l border-primary-foreground/20",
              "hover:bg-primary/90 transition-colors",
            )}
            aria-label={t("git.toolbar.moreActions")}
          >
            <ChevronDownIcon className="size-3 shrink-0" />
          </button>
        </AppMenuTrigger>
        <AppMenuContent align="end" className="min-w-[7rem]">
          <AppMenuItem onClick={onMerge}>{t("git.toolbar.merge")}</AppMenuItem>
          <AppMenuItem onClick={onCommit} disabled={stagedCount === 0}>
            {t("git.toolbar.commit")}
          </AppMenuItem>
          {pushAction && pushLabel ? (
            <AppMenuItem
              onClick={() => void handlePush()}
              disabled={Boolean(syncing)}
              trailing={
                pushing ? <Loader2Icon className="size-3 animate-spin opacity-80" /> : null
              }
            >
              {pushLabel}
            </AppMenuItem>
          ) : null}
        </AppMenuContent>
      </AppMenu>
    </div>
  );
}
