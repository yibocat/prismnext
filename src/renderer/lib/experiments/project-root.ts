/**
 * Experiment registry / island paths follow the active checkout (worktree when
 * active), matching OpenCode session cwd and the file tree — not only the
 * canonical main `projectRoot` (Bug #9).
 */
export function selectExperimentProjectRoot(state: {
  checkoutRoot: string | null;
  projectRoot: string | null;
}): string | null {
  return state.checkoutRoot ?? state.projectRoot;
}
