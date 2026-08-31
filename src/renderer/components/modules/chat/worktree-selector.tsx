/**
 * Chat chrome tokens + worktree rows used inside the Host menu.
 */
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2Icon, WorkflowIcon } from "lucide-react";
import {
  AppMenuCheckItem,
  AppMenuSeparator,
  AppMenuSub,
  AppMenuSubContent,
  AppMenuSubTrigger,
} from "@/components/ui/app-menu";
import { Hint } from "@/components/ui/hint";
import { applyCheckoutTransition, startNewWorktreeIntent } from "@/lib/git/checkout-context";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";
import { useWorktreeStore } from "@/stores/worktree-store";

export const CHAT_PANEL_TOOLBAR_BUTTON =
  "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

/** One-click Connect — outline follows Brand; hover only retints the border/text. */
export const CHAT_PANEL_TOOLBAR_OUTLINE_BUTTON =
  "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border bg-transparent px-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground transition-colors hover:border-primary hover:text-primary";

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

export function useWorktreeHostSuffix(): string | null {
  const { t } = useTranslation();
  const mode = useWorktreeStore((s) => s.mode);
  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  if (activeWorktree) return activeWorktree.name;
  if (mode === "worktree") return t("chat.worktree.short");
  return null;
}

/** Worktrees submenu + New — lives under Host, not as its own toolbar button. */
export function WorktreeHostMenuSection() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const hasMessages = useChatStore((s) => {
    const tab = s.tabs.find((item) => item.id === s.activeTabId);
    const conv = tab?.conversation;
    return Boolean(conv && (conv.turns.length > 0 || conv.live));
  });
  const worktrees = useWorktreeStore((s) => s.worktrees);
  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const mode = useWorktreeStore((s) => s.mode);
  const loading = useWorktreeStore((s) => s.loading);
  const refreshWorktrees = useWorktreeStore((s) => s.refreshWorktrees);
  const removeWorktree = useWorktreeStore((s) => s.removeWorktree);
  const pendingNew = mode === "worktree" && activeWorktree === null;

  useEffect(() => {
    if (projectRoot) void refreshWorktrees(projectRoot);
  }, [projectRoot, refreshWorktrees]);

  const refuseIfLocked = useCallback((): boolean => {
    if (!hasMessages) return false;
    toast.error(t("chat.worktree.locked"));
    return true;
  }, [hasMessages, t]);

  const handleSelectExisting = useCallback(
    (name: string) => {
      if (refuseIfLocked()) return;
      if (activeWorktree?.name === name) {
        void applyCheckoutTransition({ type: "local" });
        return;
      }
      const worktree = worktrees.find((item) => item.name === name);
      if (worktree) void applyCheckoutTransition({ type: "worktree-existing", worktree });
    },
    [activeWorktree?.name, refuseIfLocked, worktrees],
  );

  const handleSetNew = useCallback(async () => {
    if (refuseIfLocked()) return;
    if (pendingNew) {
      void applyCheckoutTransition({ type: "local" });
      return;
    }
    const ok = await startNewWorktreeIntent();
    if (!ok) toast.error(t("chat.worktree.noBaseBranch"));
  }, [pendingNew, refuseIfLocked, t]);

  const handleRemove = useCallback(
    async (name: string, event: React.MouseEvent) => {
      event.stopPropagation();
      if (!projectRoot) return;
      try {
        await removeWorktree(projectRoot, name);
      } catch {
        // store surfaces the error
      }
    },
    [projectRoot, removeWorktree],
  );

  if (!projectRoot || !isGitRepo) return null;

  return (
    <>
      <AppMenuSeparator />
      {worktrees.length > 0 ? (
        <AppMenuSub>
          <AppMenuSubTrigger leading={<WorkflowIcon className="size-3.5 shrink-0 opacity-70" />}>
            {t("chat.branch.worktrees")}
          </AppMenuSubTrigger>
          <AppMenuSubContent className="min-w-[14rem]">
            {worktrees.map((worktree) => (
              <AppMenuCheckItem
                key={worktree.name}
                selected={activeWorktree?.name === worktree.name}
                disabled={hasMessages}
                leading={<WorkflowIcon className="size-3.5 shrink-0 opacity-70" />}
                onClick={() => handleSelectExisting(worktree.name)}
                className="group"
                trailing={
                  <span className="flex items-center gap-0.5 shrink-0">
                    <span className="text-muted-foreground text-[length:var(--font-path)]">
                      {worktree.baseBranch}
                    </span>
                    <Hint label={t("chat.worktree.remove", { name: worktree.name })}>
                      <button
                        type="button"
                        className="flex size-4 items-center justify-center rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-all"
                        onClick={(event) => void handleRemove(worktree.name, event)}
                      >
                        <Trash2Icon className="size-2.5" />
                      </button>
                    </Hint>
                  </span>
                }
              >
                {worktree.name}
              </AppMenuCheckItem>
            ))}
          </AppMenuSubContent>
        </AppMenuSub>
      ) : null}
      <AppMenuCheckItem
        selected={pendingNew}
        disabled={hasMessages || loading}
        leading={<WorkflowIcon className="size-3.5 shrink-0 opacity-70" />}
        onClick={() => void handleSetNew()}
      >
        {t("chat.worktree.newWorktree")}
      </AppMenuCheckItem>
    </>
  );
}
