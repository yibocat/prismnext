export interface ExpertTeamPreambleEntry {
  id: string;
  name: string;
  description: string;
}

/** Turn preamble when the user @-mentions one or more experts in expert team mode. */
export function buildExpertTeamPreamble(experts: ExpertTeamPreambleEntry[]): string {
  if (!experts.length) return "";

  const lines = experts.map(
    (e) => `- @${e.id} — ${e.name}: ${e.description}`,
  );

  return [
    "---",
    "**Expert team invocation (this turn)**",
    "The user explicitly requested these experts for this message:",
    ...lines,
    "",
    "Delegate to each listed expert via the Task tool with a focused sub-prompt.",
    "Synthesize their outputs in your final reply unless the user asked for separate sections.",
    "---",
  ].join("\n");
}
