import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  EllipsisIcon,
  Loader2Icon,
  AlertTriangleIcon,
} from "lucide-react";
import {
  AppMenu,
  AppMenuContent,
  AppMenuDestructiveItem,
  AppMenuItem,
  AppMenuSeparator,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useGitStore, type GitCommitData } from "@/stores/git-store";
import { Hint } from "@/components/ui/hint";
import { gitDesktop } from "@/lib/desktop-api/git";
import { cn } from "@/lib/utils";
import { GitCommitFileRow } from "./git-commit-file-row";
import {
  GitChangeLineCounts,
  gitChangeRowTextClass,
  gitPanelListBodyClass,
  gitPanelListHeaderShellClass,
} from "./git-change-row-chrome";
import {
  commitSubjectLine,
  formatRelativeTime,
  parseRefs,
  refBadgePillClass,
  type CommitFile,
} from "./git-utils";

interface GitCommitDetailProps {
  gitRoot: string;
  commit: GitCommitData;
}

export function GitCommitDetail({ gitRoot, commit }: GitCommitDetailProps) {
  const { t } = useTranslation();
  const clearSelectedCommit = useGitStore((s) => s.clearSelectedCommit);
  const expandedCommitFilePaths = useGitStore((s) => s.expandedCommitFilePaths);
  const expandedSet = useMemo(
    () => new Set(expandedCommitFilePaths),
    [expandedCommitFilePaths],
  );

  const [metaExpanded, setMetaExpanded] = useState(false);
  const [statFiles, setStatFiles] = useState<CommitFile[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [revertTarget, setRevertTarget] = useState<{
    hash: string;
    message: string;
  } | null>(null);
  const [reverting, setReverting] = useState(false);

  const [resetTarget, setResetTarget] = useState<{
    hash: string;
    message: string;
  } | null>(null);
  const [resetMode, setResetMode] = useState<"soft" | "mixed" | "hard">("mixed");
  const [resetting, setResetting] = useState(false);

  const refs = parseRefs(commit.refs);
  const subject = commitSubjectLine(commit.message);
  const formattedDate = new Date(commit.date).toLocaleString();

  useEffect(() => {
    setLoading(true);
    setStatFiles(null);
    setMetaExpanded(false);
    gitDesktop
      .gitCommitFiles(gitRoot, commit.hash)
      .then((files) => setStatFiles(files))
      .catch(() => setStatFiles(null))
      .finally(() => setLoading(false));
  }, [gitRoot, commit.hash]);

  const totalAdded = statFiles?.reduce((s, f) => s + f.added, 0) ?? 0;
  const totalDeleted = statFiles?.reduce((s, f) => s + f.deleted, 0) ?? 0;
  const fileCount = statFiles?.length ?? 0;

  const handleRevert = useCallback(async () => {
    if (!revertTarget || !gitRoot) return;
    setReverting(true);
    try {
      await useGitStore.getState().revertCommit(gitRoot, revertTarget.hash);
    } finally {
      setReverting(false);
      setRevertTarget(null);
      clearSelectedCommit();
    }
  }, [revertTarget, gitRoot, clearSelectedCommit]);

  const handleReset = useCallback(async () => {
    if (!resetTarget || !gitRoot) return;
    setResetting(true);
    try {
      await useGitStore.getState().resetToCommit(gitRoot, resetTarget.hash, resetMode);
    } finally {
      setResetting(false);
      setResetTarget(null);
      clearSelectedCommit();
    }
  }, [resetTarget, resetMode, gitRoot, clearSelectedCommit]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 z-20 bg-background">
        <div className={gitPanelListHeaderShellClass}>
        <Hint label={t("git.commitDetail.back")}>
          <button
            type="button"
            className="size-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            onClick={clearSelectedCommit}
          >
            <ArrowLeftIcon className="size-3" />
          </button>
        </Hint>

        <Hint
          label={
            metaExpanded
              ? t("git.commitDetail.hideMeta")
              : t("git.commitDetail.showMeta")
          }
          triggerClassName="min-w-0 flex-1 w-full justify-start"
        >
          <div
            className="flex min-w-0 w-full items-center gap-2 px-1 -mx-1 cursor-pointer"
            onClick={() => setMetaExpanded((v) => !v)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setMetaExpanded((v) => !v);
              }
            }}
          >
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform",
              metaExpanded && "rotate-90",
            )}
          />
          <span
            className={cn(
              "shrink-0 font-medium text-muted-foreground",
              gitChangeRowTextClass,
            )}
          >
            {loading
              ? t("git.commitDetail.loading")
              : fileCount === 0
                ? t("git.commitDetail.noFiles")
                : fileCount === 1
                  ? t("git.commitDetail.fileChanged", { count: fileCount })
                  : t("git.commitDetail.filesChanged", { count: fileCount })}
          </span>
          <span className="text-muted-foreground/40 shrink-0 select-none">·</span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-medium text-foreground",
              gitChangeRowTextClass,
            )}
          >
            {subject}
          </span>
          <span
            className={cn(
              "shrink-0 tabular-nums text-muted-foreground/70",
              "text-[length:var(--font-timestamp)]",
            )}
          >
            {formatRelativeTime(commit.date)}
          </span>
          <GitChangeLineCounts added={totalAdded} deleted={totalDeleted} />
          </div>
        </Hint>

        <AppMenu>
          <Hint label={t("git.commitDetail.actions")}>
            <AppMenuTrigger asChild>
              <button
                type="button"
                className="size-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <EllipsisIcon className="size-3" />
              </button>
            </AppMenuTrigger>
          </Hint>
          <AppMenuContent align="end" className="min-w-[8.5rem]">
            <AppMenuItem
              onClick={() =>
                setRevertTarget({ hash: commit.hash, message: commit.message })
              }
            >
              {t("git.commitDetail.revertMenu")}
            </AppMenuItem>
            <AppMenuSeparator />
            <AppMenuItem
              onClick={() => {
                setResetMode("soft");
                setResetTarget({ hash: commit.hash, message: commit.message });
              }}
            >
              {t("git.commitDetail.resetSoft")}
            </AppMenuItem>
            <AppMenuItem
              onClick={() => {
                setResetMode("mixed");
                setResetTarget({ hash: commit.hash, message: commit.message });
              }}
            >
              {t("git.commitDetail.resetMixed")}
            </AppMenuItem>
            <AppMenuDestructiveItem
              onClick={() => {
                setResetMode("hard");
                setResetTarget({ hash: commit.hash, message: commit.message });
              }}
            >
              {t("git.commitDetail.resetHard")}
            </AppMenuDestructiveItem>
          </AppMenuContent>
        </AppMenu>
        </div>

        {metaExpanded && (
          <div className="border-b border-border/60 px-3 py-2.5 space-y-2 bg-muted/20">
          <div
            className={cn(
              "whitespace-pre-wrap break-all leading-relaxed text-foreground/80",
              gitChangeRowTextClass,
            )}
          >
            {commit.message}
          </div>
          <div
            className={cn(
              "flex items-center gap-2 flex-wrap text-muted-foreground",
              gitChangeRowTextClass,
            )}
          >
            <span>
              <span className="text-muted-foreground/50">{t("git.commitDetail.date")}</span>{" "}
              {formattedDate}
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span>
              <span className="text-muted-foreground/50">{t("git.commitDetail.author")}</span>{" "}
              {commit.author}
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span>
              <span className="text-muted-foreground/50">{t("git.commitDetail.hash")}</span>{" "}
              <span className="font-mono">{commit.hash}</span>
            </span>
            {refs.length > 0 && (
              <span className="flex items-center gap-0.5 flex-wrap">
                {refs.map((r) => (
                  <span
                    key={r.label}
                    className={cn(
                      "inline-flex items-center rounded px-1 py-0 text-[length:var(--font-size-10)] font-medium",
                      refBadgePillClass(r),
                    )}
                  >
                    {r.label}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
        )}
      </div>

      <div
        className="flex flex-col flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overflow-anchor-none"
        data-git-commit-scroll
      >
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <Loader2Icon className="size-4 animate-spin text-muted-foreground/30" />
        </div>
      ) : statFiles && statFiles.length > 0 ? (
        <div className={gitPanelListBodyClass}>
          {statFiles.map((f) => (
            <GitCommitFileRow
              key={f.path}
              gitRoot={gitRoot}
              commitHash={commit.hash}
              file={f}
              isExpanded={expandedSet.has(f.path)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center py-12">
          <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
            {t("git.commitDetail.noFilesInCommit")}
          </p>
        </div>
      )}
      </div>

      <Dialog
        open={revertTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevertTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("dialogs.git.revertTitle")}</DialogTitle>
            <DialogDescription className="text-xs">
              {t("git.commitDetail.revertBody")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="rounded bg-muted/50 px-3 py-2 text-xs font-mono">
              <span className="text-muted-foreground">{revertTarget?.hash}</span>{" "}
              <span>{revertTarget?.message}</span>
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setRevertTarget(null)}
              className="h-8 px-3 rounded text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleRevert}
              disabled={reverting}
              className="flex items-center gap-1.5 h-8 px-4 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {reverting
                ? t("git.commitDetail.reverting")
                : t("git.commitDetail.revert")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("dialogs.git.resetTitle")}</DialogTitle>
            <DialogDescription className="text-xs">
              {t("git.commitDetail.resetBody")}
              {resetMode === "hard" && (
                <span className="flex items-center gap-1 mt-1 text-destructive font-medium">
                  <AlertTriangleIcon className="size-3.5" />
                  {t("git.commitDetail.resetHardWarn")}
                </span>
              )}
              {resetMode === "soft" && (
                <span className="block mt-1 text-muted-foreground">
                  {t("git.commitDetail.resetSoftHint")}
                </span>
              )}
              {resetMode === "mixed" && (
                <span className="block mt-1 text-muted-foreground">
                  {t("git.commitDetail.resetMixedHint")}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="rounded bg-muted/50 px-3 py-2 text-xs font-mono">
              <span className="text-muted-foreground">{resetTarget?.hash}</span>{" "}
              <span>{resetTarget?.message}</span>
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="h-8 px-3 rounded text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting}
              className={cn(
                "flex items-center gap-1.5 h-8 px-4 rounded text-xs font-medium transition-colors disabled:opacity-50",
                resetMode === "hard"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {resetting
                ? t("git.commitDetail.resetting")
                : t("git.commitDetail.reset")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
