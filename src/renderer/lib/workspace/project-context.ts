import { parseRemoteAbs, recoverRemoteAbs } from "@shared/remote";

export type ProjectPickMode = "assign" | "focus";

export type ApplyProjectPickInput = {
  path: string;
  mode: ProjectPickMode;
  conversationId?: string;
  connectRemote?: boolean;
  newSessionAfterFocus?: boolean;
};

export type ApplyProjectPickResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "empty_path"
        | "missing_conversation"
        | "streaming"
        | "session_not_empty"
        | "join_failed"
        | "assign_failed";
    };

export type ApplySessionActivateInput = {
  conversationId: string;
  projectId: string;
  lastPath: string;
  connectRemote?: boolean;
};

export type ProjectContextDeps = {
  assignSessionToProjectPath: (conversationId: string, path: string) => Promise<boolean>;
  openRemoteWorkbenchProject: (profileId: string, remoteRoot: string) => Promise<boolean>;
  joinWorkbenchFolder: (path: string) => Promise<boolean>;
  focusProject: (path: string, opts?: { connectRemote?: boolean }) => Promise<void>;
  findMemberByPath: (path: string) => { id: string; lastPath: string } | null;
  inspectConversation: (conversationId: string) => {
    isStreaming: boolean;
    hasTurns: boolean;
  } | null;
  recordSessionProject: (conversationId: string, projectId: string) => void;
  loadSession: (
    conversationId: string,
    sessionDirectory?: string,
    projectLastPath?: string,
    opts?: { connectRemote?: boolean },
  ) => Promise<void>;
  newSession: () => void;
};

async function liveDeps(): Promise<ProjectContextDeps> {
  const lifecycle = await import("./project-lifecycle");
  const { resolveWorkbenchMemberByPath, useWorkbenchStore } = await import(
    "@/stores/workbench-store"
  );
  const { useChatStore } = await import("@/stores/chat-store");
  const { useDocumentStore } = await import("@/stores/document-store");
  return {
    assignSessionToProjectPath: lifecycle.assignSessionToProjectPath,
    openRemoteWorkbenchProject: lifecycle.openRemoteWorkbenchProject,
    joinWorkbenchFolder: lifecycle.joinWorkbenchFolder,
    focusProject: (path, opts) => useDocumentStore.getState().focusProject(path, opts),
    findMemberByPath: (path) => resolveWorkbenchMemberByPath(useWorkbenchStore.getState(), path),
    inspectConversation: (conversationId) => {
      const tab = useChatStore.getState().tabs.find((item) => item.id === conversationId);
      if (!tab) return { isStreaming: false, hasTurns: false };
      const conversation = tab.conversation;
      return {
        isStreaming: Boolean(tab.isStreaming),
        hasTurns: Boolean(conversation && (conversation.turns.length > 0 || conversation.live)),
      };
    },
    recordSessionProject: (conversationId, projectId) => {
      useWorkbenchStore.getState().recordSessionProject(conversationId, projectId);
    },
    loadSession: (conversationId, sessionDirectory, projectLastPath, opts) =>
      useChatStore.getState().loadSession(conversationId, sessionDirectory, projectLastPath, opts),
    newSession: () => useChatStore.getState().newSession(),
  };
}

function canonicalProjectPath(path: string): string {
  const trimmed = path.trim();
  return recoverRemoteAbs(trimmed) ?? trimmed;
}

export async function applyProjectPick(
  input: ApplyProjectPickInput,
  deps?: ProjectContextDeps,
): Promise<ApplyProjectPickResult> {
  const host = deps ?? await liveDeps();
  const path = canonicalProjectPath(input.path);
  if (!path) return { ok: false, reason: "empty_path" };
  const connectRemote = input.connectRemote ?? false;
  const remote = parseRemoteAbs(path);

  if (input.mode === "assign") {
    const conversationId = input.conversationId?.trim() ?? "";
    if (!conversationId) return { ok: false, reason: "missing_conversation" };
    const conversation = host.inspectConversation(conversationId);
    if (conversation?.isStreaming) return { ok: false, reason: "streaming" };
    if (conversation?.hasTurns) return { ok: false, reason: "session_not_empty" };

    if (!host.findMemberByPath(path)) {
      if (remote) {
        const opened = await host.openRemoteWorkbenchProject(remote.profileId, remote.abs);
        if (!opened) return { ok: false, reason: "join_failed" };
      } else {
        const joined = await host.joinWorkbenchFolder(path);
        if (!joined) return { ok: false, reason: "join_failed" };
      }
    }

    const assigned = await host.assignSessionToProjectPath(conversationId, path);
    if (!assigned) return { ok: false, reason: "assign_failed" };
    return { ok: true };
  }

  const member = host.findMemberByPath(path);
  if (!member) {
    if (remote) {
      const opened = await host.openRemoteWorkbenchProject(remote.profileId, remote.abs);
      if (!opened) return { ok: false, reason: "join_failed" };
    } else {
      const joined = await host.joinWorkbenchFolder(path);
      if (!joined) return { ok: false, reason: "join_failed" };
      await host.focusProject(path, { connectRemote });
    }
  } else {
    await host.focusProject(path, { connectRemote });
  }
  if (input.newSessionAfterFocus) host.newSession();
  return { ok: true };
}

export async function applySessionActivate(
  input: ApplySessionActivateInput,
  deps?: ProjectContextDeps,
): Promise<void> {
  const host = deps ?? await liveDeps();
  const connectRemote = input.connectRemote ?? false;
  const lastPath = canonicalProjectPath(input.lastPath);
  host.recordSessionProject(input.conversationId, input.projectId);
  await host.focusProject(lastPath, { connectRemote });
  await host.loadSession(input.conversationId, undefined, lastPath, { connectRemote });
}
