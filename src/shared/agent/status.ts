/**
 * OpenCode ACP agent lifecycle as surfaced to the renderer (status dot, welcome).
 * `available` is true only when the ACP child is connected and healthy — never
 * merely because the binary exists on disk.
 */

export const AGENT_LIFECYCLE_PHASES = [
  "starting",
  "ready",
  "error",
  "stopped",
] as const;

export type AgentLifecyclePhase = (typeof AGENT_LIFECYCLE_PHASES)[number];

export const PROJECT_WARM_PHASES = [
  "none",
  "warming",
  "ready",
  "error",
] as const;

export type ProjectWarmPhase = (typeof PROJECT_WARM_PHASES)[number];

export interface AgentStatusSnapshot {
  phase: AgentLifecyclePhase;
  /** True only when ACP is connected and considered healthy. */
  available: boolean;
  version: string;
  error: string | null;
  binaryPresent: boolean;
  /**
   * Whether project chat prewarm finished for the queried project.
   * `null` when no projectPath was provided.
   * Prefer `projectWarmPhase` for UI.
   */
  projectWarm: boolean | null;
  /** Project tools/skills/experts prewarm phase for the queried path. */
  projectWarmPhase: ProjectWarmPhase | null;
  projectWarmError: string | null;
}

export function isAgentLifecyclePhase(value: unknown): value is AgentLifecyclePhase {
  return (
    typeof value === "string"
    && (AGENT_LIFECYCLE_PHASES as readonly string[]).includes(value)
  );
}

export function isProjectWarmPhase(value: unknown): value is ProjectWarmPhase {
  return (
    typeof value === "string"
    && (PROJECT_WARM_PHASES as readonly string[]).includes(value)
  );
}
