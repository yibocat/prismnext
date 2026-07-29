import { useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  GitBranchIcon,
  Loader2Icon,
  LaptopIcon,
  LockIcon,
  Trash2Icon,
} from "lucide-react";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuItem,
  AppMenuLabel,
  AppMenuSeparator,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useDocumentStore } from "@/stores/document-store";
import { applyCheckoutTransition } from "@/lib/git/checkout-context";
import { useGitStore } from "@/stores/git-store";
import { useChatStore } from "@/stores/chat-store";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

/**
 * AI Chat panel toolbar (branch / worktree / actions) — `h-6` like Plan
 * `Button size="xs"`, type via `--font-chat-meta` (chat chrome step).
 */
export const CHAT_PANEL_TOOLBAR_BUTTON =
  "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

export const CHAT_PANEL_TOOLBAR_BUTTON_PRIMARY =
  "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[length:var(--font-chat-meta)] text-primary transition-colors hover:bg-accent hover:text-accent-foreground";

/**
 * Composer inner triggers (model / permission / +) — same chrome density as
 * `CHAT_PANEL_TOOLBAR_BUTTON` (h-6 + meta). Not for AiBar capsule pills.
 */
export const COMPOSER_TOOLBAR_TRIGGER =
  "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground outline-hidden focus-visible:ring-1 focus-visible:ring-ring";

export const COMPOSER_TOOLBAR_ICON_BUTTON =
  "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

/** Override `Button size="xs"` default 12px so Plan / tool actions use chat chrome. */
export const CHAT_CHROME_BUTTON_TEXT = "text-[length:var(--font-chat-meta)]";

/** Capsule AiBar only — dedicated pill, not Appearance border radius. */
export const CAPSULE_TOOLBAR_PILL =
  "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 text-[length:var(--font-chat-meta)] transition-colors";

interface WorktreeSelectorProps {
  /** `capsule` = AiBar toolbar pill; default = left chat panel (unchanged). */
  variant?: "default" | "capsule";
}

export function WorktreeSelector({ variant = "default" }: WorktreeSelectorProps) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const hasMessages = useChatStore((s) => s.messages.length > 0);
  const {
    worktrees,
    activeWorktree,
    mode,
    loading,
    refreshWorktrees,
    removeWorktree,
  } = useWorktreeStore();

  useEffect(() => {
    if (projectRoot) {
      refreshWorktrees(projectRoot);
    }
  }, [projectRoot, refreshWorktrees]);

  const handleSetLocal = useCallback(() => {
    void applyCheckoutTransition({ type: "local" });
  }, []);

  const handleSetNewWorktree = useCallback(async () => {
    const gs = useGitStore.getState();
    const wtStore = useWorktreeStore.getState();
    let baseBranch = wtStore.activeWorktree?.baseBranch ?? null;
    if (!baseBranch && projectRoot && gs.isGitRepo) {
      if (!gs.branch) {
        await gs.refreshStatus(projectRoot);
        await gs.refreshBranches(projectRoot);
      }
      baseBranch = useGitStore.getState().branch;
    }
    if (!baseBranch) {
      toast.error("Cannot determine base branch — is Git initialized?");
      return;
    }
    void applyCheckoutTransition({ type: "worktree-intent", baseBranch });
  }, [projectRoot]);

  const handleSelectExisting = useCallback(
    (wtName: string) => {
      const wt = worktrees.find((w) => w.name === wtName);
      if (wt) void applyCheckoutTransition({ type: "worktree-existing", worktree: wt });
    },
    [worktrees],
  );

  const handleRemove = useCallback(
    async (name: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!projectRoot) return;
      try {
        await removeWorktree(projectRoot, name);
      } catch {}
    },
    [projectRoot, removeWorktree],
  );

  const isActive = activeWorktree !== null;

  const triggerLabel = isActive
    ? activeWorktree.name
    : mode === "worktree"
      ? t("chat.worktree.newWorktree")
      : t("chat.worktree.local");

  if (!isGitRepo) return null;

  const isCapsule = variant === "capsule";

  if (hasMessages) {
    return (
      <span
        className={cn(
          isCapsule ? CAPSULE_TOOLBAR_PILL : CHAT_PANEL_TOOLBAR_BUTTON,
          "cursor-default",
          !isCapsule && "hover:bg-transparent hover:text-muted-foreground",
          mode === "worktree" && !isCapsule && "text-primary hover:text-primary",
          isCapsule && mode === "worktree" && "bg-accent text-accent-foreground border-border",
          isCapsule && mode !== "worktree" && "bg-card text-muted-foreground",
        )}
        title={t("chat.worktree.lockedWithLabel", { label: triggerLabel })}
      >
        {mode === "local" ? (
          <LaptopIcon className={cn("shrink-0", isCapsule ? "size-3.5" : "size-3")} />
        ) : (
          <GitBranchIcon className={cn("shrink-0", isCapsule ? "size-3.5" : "size-3")} />
        )}
        <span className="max-w-[100px] truncate hidden @md:inline">{triggerLabel}</span>
        <LockIcon className="size-3 text-muted-foreground/50" />
      </span>
    );
  }

  return (
    <AppMenu>
      <Hint label={triggerLabel}>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              isCapsule ? CAPSULE_TOOLBAR_PILL : CHAT_PANEL_TOOLBAR_BUTTON,
              mode === "worktree"
                ? isCapsule
                  ? "bg-accent text-accent-foreground border-border hover:bg-accent"
                  : "text-primary hover:bg-accent hover:text-accent-foreground"
                : isCapsule
                  ? "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  : undefined,
            )}
            onMouseDown={(e) => e.preventDefault()}
          >
            {mode === "local" ? (
              <LaptopIcon className={cn("shrink-0", isCapsule ? "size-3.5" : "size-3")} />
            ) : (
              <GitBranchIcon className={cn("shrink-0", isCapsule ? "size-3.5" : "size-3")} />
            )}
            <span className="max-w-[100px] truncate hidden @md:inline">{triggerLabel}</span>
          </button>
        </AppMenuTrigger>
      </Hint>
      <AppMenuContent align="start" className="w-56">
        <AppMenuCheckItem selected={mode === "local"} onClick={handleSetLocal}>
          {t("chat.worktree.local")}
        </AppMenuCheckItem>

        {worktrees.length > 0 && (
          <>
            <AppMenuSeparator />
            <AppMenuLabel>{t("chat.worktree.existing")}</AppMenuLabel>
            {worktrees.map((wt) => (
              <AppMenuItem
                key={wt.name}
                onClick={() => handleSelectExisting(wt.name)}
                className="group"
                trailing={
                  <span className="flex items-center gap-0.5 shrink-0">
                    {wt.aheadCount > 0 && (
                      <span className="text-[length:var(--font-hint)] text-muted-foreground/50">
                        {wt.aheadCount}↑
                      </span>
                    )}
                    {wt.behindCount > 0 && (
                      <span
                        className="text-[length:var(--font-hint)] text-amber-500"
                        title={t("chat.worktree.commitsBehind", { n: wt.behindCount })}
                      >
                        {wt.behindCount}↓
                      </span>
                    )}
                    {activeWorktree?.name === wt.name && (
                      <span className="text-[length:var(--font-badge)] text-primary">
                        {t("chat.worktree.active")}
                      </span>
                    )}
                    <Hint label={t("chat.worktree.remove", { name: wt.name })}>
                      <button
                        type="button"
                        className="flex size-4 items-center justify-center rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                        onClick={(e) => void handleRemove(wt.name, e)}
                      >
                        <Trash2Icon className="size-2.5" />
                      </button>
                    </Hint>
                  </span>
                }
              >
                {wt.name}
              </AppMenuItem>
            ))}
          </>
        )}

        <AppMenuSeparator />
        <AppMenuItem
          onClick={handleSetNewWorktree}
          disabled={loading}
          trailing={
            loading ? (
              <Loader2Icon className="size-3 animate-spin opacity-80" />
            ) : mode === "worktree" && !isActive ? (
              <span className="text-[length:var(--font-badge)] text-primary">
                {t("chat.worktree.selected")}
              </span>
            ) : null
          }
        >
          {t("chat.worktree.newWorktree")}
        </AppMenuItem>
      </AppMenuContent>
    </AppMenu>
  );
}
