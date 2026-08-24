import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuSeparator,
  AppContextMenuSub,
  AppContextMenuSubContent,
  AppContextMenuSubTrigger,
  AppContextMenuTrigger,
} from "@/components/ui/app-context-menu";
import { SessionIconPickerPanel } from "@/components/layout/session-icon-picker";
import { ICON_PICKER_PANEL_WIDTH_CLASS } from "@/components/modules/shared/icon-picker";
import {
  archiveSessionAction,
  copySessionBranchAction,
  copySessionIdAction,
  copySessionTranscriptAction,
  pinSessionAction,
  renameSessionAction,
  setSessionUnreadAction,
  type CopyActionResult,
} from "@/lib/chat/session-context-actions";
import { useGitStore } from "@/stores/git-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { cn } from "@/lib/utils";

export { AppContextMenuTrigger as SessionContextMenuTrigger };

function pointerTargetIsRootContextMenu(event: {
  target: EventTarget | null;
  detail?: { originalEvent?: Event };
}): boolean {
  const target = event.detail?.originalEvent?.target ?? event.target;
  return target instanceof Element && !!target.closest("[data-slot='context-menu-content']");
}

interface SessionContextMenuProps {
  sessionId: string;
  title: string;
  projectRoot: string | null;
  sessionDirectory?: string | null;
  pinned: boolean;
  archived: boolean;
  unread: boolean;
  onRequestRename: () => void;
  onAfterArchive?: () => void;
  children: ReactElement;
}

export function SessionContextMenu({
  sessionId,
  title,
  projectRoot,
  sessionDirectory,
  pinned,
  archived,
  unread,
  onRequestRename,
  onAfterArchive,
  children,
}: SessionContextMenuProps) {
  const { t } = useTranslation();
  const [menuEpoch, setMenuEpoch] = useState(0);
  const worktrees = useWorktreeStore((s) => s.worktrees);
  const liveBranch = useGitStore((s) => s.branch);
  const dismissMenu = () => setMenuEpoch((n) => n + 1);

  const toastCopy = (result: CopyActionResult, emptyKey: string) => {
    if (result === "copied") return;
    if (result === "empty") {
      toast.error(t(emptyKey));
      return;
    }
    if (result === "load-failed") {
      toast.error(t("nav.sessions.copyTranscriptLoadFailed"));
      return;
    }
    toast.error(t("nav.sessions.copyFailed"));
  };

  return (
    <AppContextMenu key={menuEpoch}>
      {children}
      <AppContextMenuContent>
        {archived ? null : (
          <AppContextMenuItem
            disabled={!projectRoot}
            onSelect={() => {
              if (!projectRoot) return;
              void pinSessionAction(projectRoot, sessionId);
            }}
          >
            {pinned ? t("nav.sessions.unpin") : t("nav.sessions.pin")}
          </AppContextMenuItem>
        )}
        <AppContextMenuItem onSelect={onRequestRename}>
          {t("nav.sessions.rename")}
        </AppContextMenuItem>
        <AppContextMenuSub>
          <AppContextMenuSubTrigger disabled={!projectRoot}>
            {t("nav.sessions.editIcon")}
          </AppContextMenuSubTrigger>
          {projectRoot ? (
            <AppContextMenuSubContent
              className={cn(
                ICON_PICKER_PANEL_WIDTH_CLASS,
                "min-w-[17.5rem] max-w-[17.5rem] p-0 gap-0 overflow-hidden",
              )}
              onEscapeKeyDown={(event) => {
                event.preventDefault();
                dismissMenu();
              }}
              onPointerDownOutside={(event) => {
                if (pointerTargetIsRootContextMenu(event)) return;
                dismissMenu();
              }}
            >
              <SessionIconPickerPanel projectRoot={projectRoot} sessionId={sessionId} />
            </AppContextMenuSubContent>
          ) : null}
        </AppContextMenuSub>
        <AppContextMenuItem
          disabled={!projectRoot}
          onSelect={() => {
            if (!projectRoot) return;
            void setSessionUnreadAction(projectRoot, sessionId, !unread);
          }}
        >
          {unread ? t("nav.sessions.markRead") : t("nav.sessions.markUnread")}
        </AppContextMenuItem>
        <AppContextMenuSeparator />
        <AppContextMenuSub>
          <AppContextMenuSubTrigger>{t("nav.sessions.copy")}</AppContextMenuSubTrigger>
          <AppContextMenuSubContent>
            <AppContextMenuItem
              onSelect={() => {
                void copySessionIdAction(sessionId).then((result) => {
                  toastCopy(result, "nav.sessions.copyFailed");
                });
              }}
            >
              {t("nav.sessions.copySessionId")}
            </AppContextMenuItem>
            <AppContextMenuItem
              onSelect={() => {
                void copySessionBranchAction({
                  directory: sessionDirectory,
                  projectRoot,
                  worktrees,
                  liveBranch,
                }).then((result) => {
                  toastCopy(result, "nav.sessions.copyNoBranch");
                });
              }}
            >
              {t("nav.sessions.copyBranch")}
            </AppContextMenuItem>
            <AppContextMenuItem
              onSelect={() => {
                void copySessionTranscriptAction({
                  sessionId,
                  projectRoot,
                  title,
                }).then((result) => {
                  toastCopy(result, "nav.sessions.copyTranscriptEmpty");
                });
              }}
            >
              {t("nav.sessions.copyTranscript")}
            </AppContextMenuItem>
          </AppContextMenuSubContent>
        </AppContextMenuSub>
        <AppContextMenuSeparator />
        <AppContextMenuItem
          disabled={!projectRoot}
          onSelect={() => {
            if (!projectRoot) return;
            void archiveSessionAction(projectRoot, sessionId);
            onAfterArchive?.();
          }}
        >
          {archived ? t("nav.sessions.restoreFromArchive") : t("nav.sessions.archive")}
        </AppContextMenuItem>
      </AppContextMenuContent>
    </AppContextMenu>
  );
}

interface SessionTitleInlineProps {
  title: string;
  editing: boolean;
  className?: string;
  sessionId: string;
  onCancel: () => void;
}

export function SessionTitleInline({
  title,
  editing,
  className,
  sessionId,
  onCancel,
}: SessionTitleInlineProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  if (!editing) {
    return <span className={className}>{title}</span>;
  }

  const commit = (raw: string) => {
    const next = raw.trim();
    onCancel();
    if (!next || next === title) return;
    void renameSessionAction(sessionId, next);
  };

  return (
    <input
      ref={ref}
      defaultValue={title}
      placeholder={t("chat.openTabs.renamePlaceholder")}
      className={cn(
        className,
        "box-border h-[1.25rem] w-full rounded-[3px] border border-border bg-background px-0.5 outline-none",
      )}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget.value);
        }
      }}
      onBlur={(event) => commit(event.currentTarget.value)}
    />
  );
}
