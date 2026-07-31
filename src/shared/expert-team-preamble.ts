export interface ExpertTeamPreambleEntry {
  id: string;
  name: string;
  description: string;
}

/**
 * Turn appendix when the user @-mentions experts.
 * Hard rules live in main (Task allowlist + must-invoke follow-up).
 * This text must not let the orchestrator role-play as the expert.
 */
export function buildExpertTeamPreamble(experts: ExpertTeamPreambleEntry[]): string {
  if (!experts.length) return "";

  const lines = experts.map(
    (e) => `- @${e.id} — ${e.name}: ${e.description}`,
  );

  return [
    "---",
    "**Delegated subagents (this turn)**",
    "You are the **orchestrator** in this conversation — you are NOT any of the subagents below.",
    "Do **not** assume their identity, speak as them, or do their specialty work with platform tools in this turn.",
    "You **must** call the Task tool once per listed id (`subagent_type` = that id) with a focused sub-prompt for the user's request.",
    "This turn's Task allowlist is only these ids (other Task targets are denied). After Task results return, synthesize for the user.",
    ...lines,
    "---",
  ].join("\n");
}
