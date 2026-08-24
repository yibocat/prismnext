import type { Conversation } from "@shared/agent/conversation";
import type { SessionIconConfig } from "@shared/chat/session-chrome";
import type { WorktreeInfo } from "@/types/electron";
import { useChatStore } from "@/stores/chat-store";
import { agentDesktop } from "@/lib/desktop-api/agent";
import { setSessionIcon, setSessionUnread } from "@/lib/chat/session-chrome";
import {
  formatConversationTranscript,
  transcriptHasBody,
} from "@/lib/chat/session-transcript";
import {
  toggleArchiveSessionForProject,
  togglePinSessionForProject,
} from "@/lib/chat/session-ui-prefs";
import {
  readCurrentGitBranch,
  resolveSessionWorktreeContext,
} from "@/lib/git/session-worktree-context";
import { writeClipboardText } from "@/lib/utils";

export type CopyActionResult = "copied" | "empty" | "load-failed" | "failed";

export async function pinSessionAction(projectRoot: string, sessionId: string): Promise<void> {
  await togglePinSessionForProject(projectRoot, sessionId);
}

export async function archiveSessionAction(projectRoot: string, sessionId: string): Promise<void> {
  await toggleArchiveSessionForProject(projectRoot, sessionId);
}

export async function setSessionUnreadAction(
  projectRoot: string,
  sessionId: string,
  unread: boolean,
): Promise<void> {
  await setSessionUnread(projectRoot, sessionId, unread);
}

export async function setSessionIconAction(
  projectRoot: string,
  sessionId: string,
  icon: SessionIconConfig | null,
): Promise<void> {
  await setSessionIcon(projectRoot, sessionId, icon);
}

/** Same path as SessionContextCard hover rename. */
export async function renameSessionAction(sessionId: string, title: string): Promise<void> {
  await useChatStore.getState().renameSession(sessionId, title);
}

export async function copySessionIdAction(sessionId: string): Promise<CopyActionResult> {
  return (await writeClipboardText(sessionId)) ? "copied" : "failed";
}

export async function resolveSessionBranchName(input: {
  directory?: string | null;
  projectRoot: string | null;
  worktrees: WorktreeInfo[];
  liveBranch?: string | null;
}): Promise<string | null> {
  const checkout = resolveSessionWorktreeContext(
    input.directory,
    input.projectRoot,
    input.worktrees,
  );
  if (checkout.gitBranch) return checkout.gitBranch;

  const sameProjectLocal =
    checkout.kind === "local"
    && Boolean(input.projectRoot)
    && (!input.directory || input.directory === input.projectRoot);
  const live = input.liveBranch?.trim();
  if (sameProjectLocal && live && live !== "(no branch)") return live;

  if (!checkout.directory) return null;
  return readCurrentGitBranch(checkout.directory);
}

export async function copySessionBranchAction(input: {
  directory?: string | null;
  projectRoot: string | null;
  worktrees: WorktreeInfo[];
  liveBranch?: string | null;
}): Promise<CopyActionResult> {
  const branch = await resolveSessionBranchName(input);
  if (!branch) return "empty";
  return (await writeClipboardText(branch)) ? "copied" : "failed";
}

export function conversationFromOpenTab(sessionId: string): Conversation | null {
  const tab = useChatStore.getState().tabs.find((item) => (
    item.id === sessionId
    || item.sessionId === sessionId
    || item.conversation.conversationId === sessionId
  ));
  return tab?.conversation ?? null;
}

export async function loadConversationForCopy(
  sessionId: string,
  projectRoot: string | null,
): Promise<Conversation | null> {
  const open = conversationFromOpenTab(sessionId);
  if (open) return open;
  if (!projectRoot) return null;
  const result = await agentDesktop.agentLoadSession({
    conversationId: sessionId,
    projectRoot,
  });
  if (!result.ok || !result.conversation) return null;
  return result.conversation;
}

export async function copySessionTranscriptAction(input: {
  sessionId: string;
  projectRoot: string | null;
  title: string;
}): Promise<CopyActionResult> {
  const conversation = await loadConversationForCopy(input.sessionId, input.projectRoot);
  if (!conversation) return "load-failed";
  const markdown = formatConversationTranscript(conversation, input.title);
  if (!transcriptHasBody(markdown)) return "empty";
  return (await writeClipboardText(markdown)) ? "copied" : "failed";
}
