/**
 * Experiment registry / island paths follow the active checkout (worktree when
 * active), matching OpenCode session cwd and the file tree — not only the
 * canonical main `projectRoot` (Bug #9).
 */
import { useDocumentStore } from "@/stores/document-store";

export function selectExperimentProjectRoot(state: {
  checkoutRoot: string | null;
  projectRoot: string | null;
}): string | null {
  return state.checkoutRoot ?? state.projectRoot;
}

export function getExperimentProjectRoot(): string | null {
  return selectExperimentProjectRoot(useDocumentStore.getState());
}

export function useExperimentProjectRoot(): string | null {
  return useDocumentStore(selectExperimentProjectRoot);
}
