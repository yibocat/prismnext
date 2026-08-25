import { useMemo } from "react";
import {
  intersectTouchedWorkingPaths,
  sameCheckoutPath,
} from "@shared/git";
import { useChatStore } from "@/stores/chat-store";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { useGitStore } from "@/stores/git-store";
import { useWorkbenchStore } from "@/stores/workbench-store";

export type LastAgentTurnStatus =
  | "ready"
  | "no-tab"
  | "wrong-checkout"
  | "no-turn"
  | "empty";

export interface LastAgentTurnSnapshot {
  gitRoot: string;
  activeTabId: string | null;
  tabBelongsToProject: boolean;
  boundCheckoutPath: string | null;
  pendingTouched: string[] | null;
  latestTouched: string[] | null;
  latestTurnIndex?: number;
  workingPaths: string[];
}

export interface LastAgentTurnResult {
  paths: Set<string>;
  status: LastAgentTurnStatus;
  turnIndex?: number;
}

export function resolveLastAgentTurnFromSnapshot(
  input: LastAgentTurnSnapshot,
): LastAgentTurnResult {
  if (!input.activeTabId || !input.tabBelongsToProject) {
    return { paths: new Set(), status: "no-tab" };
  }
  if (
    input.boundCheckoutPath
    && !sameCheckoutPath(input.boundCheckoutPath, input.gitRoot)
  ) {
    return { paths: new Set(), status: "wrong-checkout" };
  }

  const touched = input.pendingTouched ?? input.latestTouched;
  if (!touched) return { paths: new Set(), status: "no-turn" };
  if (touched.length === 0) return { paths: new Set(), status: "empty" };

  const paths = intersectTouchedWorkingPaths(touched, input.workingPaths);
  if (paths.size === 0) return { paths, status: "empty" };
  return { paths, status: "ready", turnIndex: input.latestTurnIndex };
}

export function resolveLastAgentTurnPaths(input: {
  gitRoot: string;
  projectId: string;
  workingPaths: string[];
}): LastAgentTurnResult {
  const chat = useChatStore.getState();
  const tab = chat.tabs.find((item) => item.id === chat.activeTabId) ?? null;
  const sessionProject = tab?.sessionId
    ? useWorkbenchStore.getState().sessionProjectIds[tab.sessionId]
    : undefined;
  const tabBelongsToProject = Boolean(tab) && (!sessionProject || sessionProject === input.projectId);

  const checkpoints = useCheckpointStore.getState();
  const tabState = tab ? checkpoints.byTab[tab.id] : undefined;
  const latest = tab ? checkpoints.getLatestCheckpoint(tab.id) : null;
  const pendingTouched = tabState?.pendingTurn
    ? [...tabState.pendingTurn.touchedPaths]
    : null;

  return resolveLastAgentTurnFromSnapshot({
    gitRoot: input.gitRoot,
    activeTabId: tab?.id ?? null,
    tabBelongsToProject,
    boundCheckoutPath: tabState?.boundCheckoutPath ?? tab?.sessionCwd ?? null,
    pendingTouched,
    latestTouched: latest?.touchedThisTurn ?? null,
    latestTurnIndex: tabState?.pendingTurn?.turnIndex ?? latest?.turnIndex,
    workingPaths: input.workingPaths,
  });
}

export function useLastAgentTurnLens(): LastAgentTurnResult {
  const unitRoot = useGitStore((s) => s.unitRoot);
  const files = useGitStore((s) => s.files);
  const projectId = useWorkbenchStore((s) => s.focusProjectId);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const tabCheckpoint = useCheckpointStore((s) => (activeTabId ? s.byTab[activeTabId] : undefined));

  return useMemo(
    () =>
      resolveLastAgentTurnPaths({
        gitRoot: unitRoot ?? "",
        projectId: projectId ?? "",
        workingPaths: files.map((file) => file.path),
      }),
    [unitRoot, projectId, files, activeTabId, tabCheckpoint],
  );
}
