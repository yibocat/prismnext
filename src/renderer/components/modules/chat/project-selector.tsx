import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FolderIcon, LockIcon } from "lucide-react";
import { WorkbenchProjectPicker } from "@/components/layout/workbench-add-menu";
import { cn } from "@/lib/utils";
import {
  assignSessionToProjectPath,
  pickFolderAndAssignSession,
} from "@/lib/workspace/project-lifecycle";
import { useChatStore } from "@/stores/chat-store";
import { selectableWorkbenchProjects, useWorkbenchStore } from "@/stores/workbench-store";
import { CHAT_PANEL_TOOLBAR_BUTTON } from "./worktree-selector";

export function ProjectSelector() {
  const { t } = useTranslation();
  const members = useWorkbenchStore((s) => selectableWorkbenchProjects(s));
  const focusProjectId = useWorkbenchStore((s) => s.focusProjectId);
  const sessionProjectIds = useWorkbenchStore((s) => s.sessionProjectIds);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const streaming = useChatStore((s) => {
    const tab = s.tabs.find((item) => item.id === s.activeTabId);
    return Boolean(tab?.isStreaming);
  });

  const currentId = (activeTabId && sessionProjectIds[activeTabId]) || focusProjectId;
  const current = members.find((member) => member.id === currentId) ?? members[0];
  const label = current?.displayName || t("chat.project.select");

  const handlePickPath = useCallback(
    (path: string) => {
      if (streaming || !activeTabId) return;
      void assignSessionToProjectPath(activeTabId, path);
    },
    [activeTabId, streaming],
  );

  const handleOpenFolder = useCallback(() => {
    if (streaming || !activeTabId) return;
    void pickFolderAndAssignSession(activeTabId);
  }, [activeTabId, streaming]);

  const handleProjectCreated = useCallback(
    (path: string) => {
      if (streaming || !activeTabId) return;
      void assignSessionToProjectPath(activeTabId, path);
    },
    [activeTabId, streaming],
  );

  return (
    <WorkbenchProjectPicker
      hintLabel={streaming ? t("chat.project.locked") : label}
      disabled={streaming}
      onPickPath={handlePickPath}
      onOpenFolder={handleOpenFolder}
      onProjectCreated={handleProjectCreated}
    >
      <button
        type="button"
        className={cn(
          CHAT_PANEL_TOOLBAR_BUTTON,
          streaming
            ? "cursor-not-allowed opacity-70 hover:bg-transparent hover:text-muted-foreground/70"
            : undefined,
        )}
        onMouseDown={(e) => e.preventDefault()}
        disabled={streaming}
      >
        <FolderIcon className="size-3 shrink-0" />
        <span className="max-w-[100px] truncate hidden @md:inline">{label}</span>
        {streaming && <LockIcon className="size-2.5" />}
      </button>
    </WorkbenchProjectPicker>
  );
}
