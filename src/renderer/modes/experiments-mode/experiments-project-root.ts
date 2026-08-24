/**
 * Experiment registry / island paths follow the active checkout (worktree when
 * active), matching OpenCode session cwd and the file tree — not only the
 * canonical main `projectRoot` (Bug #9).
 */
import { selectExperimentProjectRoot } from "@/lib/experiments/project-root";
import { useDocumentStore } from "@/stores/document-store";

export { selectExperimentProjectRoot };

export function getExperimentProjectRoot(): string | null {
  return selectExperimentProjectRoot(useDocumentStore.getState());
}

export function useExperimentProjectRoot(): string | null {
  return useDocumentStore(selectExperimentProjectRoot);
}
