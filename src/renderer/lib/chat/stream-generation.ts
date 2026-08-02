/**
 * Guard delayed `chat:complete` / session-idle backups that clear `isStreaming`.
 * After Stop + immediate queue drain, a stale complete must not kill the new turn.
 */
export function canClearStreamingForGeneration(
  generationAtEvent: number,
  currentGeneration: number,
): boolean {
  return generationAtEvent === currentGeneration;
}
