export interface SubagentRosterEntry {
  id: string;
  name: string;
  goodFor: string;
  notFor: string;
  kind: "builtin" | "expert";
}

export const OPEN_BUILTIN_ROSTER: SubagentRosterEntry[] = [
  {
    id: "general",
    name: "General",
    goodFor: "Multi-step sub-tasks that need reasoning, synthesis, or mixed tool use",
    notFor: "Exhaustive repo-wide search (use explore), one-off shell commands (use command), quick web recon (use scout)",
    kind: "builtin",
  },
  {
    id: "explore",
    name: "Explore",
    goodFor: "Fast codebase exploration — finding files, symbols, and patterns across the project",
    notFor: "Making edits, running shell commands, or domain-specific expert analysis",
    kind: "builtin",
  },
  {
    id: "command",
    name: "Command",
    goodFor: "Shell and terminal work — builds, git ops, scripts, and one-off commands",
    notFor: "Broad research, literature synthesis, or prose writing",
    kind: "builtin",
  },
  {
    id: "scout",
    name: "Scout",
    goodFor: "Quick external recon — web lookups, lightweight fact gathering, and short research passes",
    notFor: "Deep codebase analysis or project expert domains",
    kind: "builtin",
  },
];

function formatRosterLine(entry: SubagentRosterEntry): string {
  return `- \`${entry.id}\` — ${entry.name}. Good for: ${entry.goodFor}. Not for: ${entry.notFor}.`;
}

export function buildSubagentRosterMarkdown(
  experts: { id: string; name: string; description: string }[],
): string {
  const lines: string[] = [
    "## Available subagents (via Task)",
    "",
    "### Built-in",
    ...OPEN_BUILTIN_ROSTER.map(formatRosterLine),
    "",
    "### Project experts",
  ];

  if (experts.length === 0) {
    lines.push(
      "",
      "No project experts are currently allowed for this orchestrator. Prefer direct project tools for citation/bib checks; delegate other work via Task only when appropriate.",
    );
  } else {
    lines.push(
      ...experts.map(
        (e) =>
          `- \`${e.id}\` — ${e.name}. Good for: ${e.description}. Not for: work outside this expert's specialty.`,
      ),
    );
  }

  lines.push(
    "",
    "Choose by fit among the list above. Do not Task to `plan` or `build`.",
  );

  return lines.join("\n");
}
