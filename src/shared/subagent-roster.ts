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

/** Expert the Pi `task` tool will accept this session (`expertId` = `id`). */
export interface LiveTaskRosterExpert {
  id: string;
  name: string;
  description: string;
  fqid?: string;
}

/**
 * Session-injected Task roster for the Pi host.
 *
 * Do not reuse {@link buildSubagentRosterMarkdown} here: that snapshot still
 * lists OpenCode builtins (`general` / `explore` / `command` / `scout`) that
 * the Pi `task` tool does not accept.
 */
export function buildLiveTaskRosterMarkdown(
  experts: LiveTaskRosterExpert[],
): string {
  const lines: string[] = [
    "## Available subagents (via Task)",
    "",
    "This list is injected for **this session** by PrismNext. It is the only authoritative roster.",
    "",
    "When the user asks to use a subagent, expert, or team specialist, call the **task** tool immediately with `expertId` from this list.",
    "",
    "**Do not** discover experts by searching the project. Do not `ls`, `find`, `grep`, or `read` `team.json`, `teams.json`, `subagents/`, or `.prismnext/agent/teams/` to decide who to call.",
    "",
  ];

  if (experts.length === 0) {
    lines.push(
      "No project experts are enabled for this session. There is no `task` tool. Use your own tools, or ask the user to enable an expert in Settings → Teams.",
    );
    return lines.join("\n");
  }

  lines.push("### Project experts");
  for (const expert of experts) {
    const alias =
      expert.fqid && expert.fqid !== expert.id
        ? ` Also accepts \`${expert.fqid}\`.`
        : "";
    const description = expert.description.trim() || "Team expert.";
    lines.push(`- \`${expert.id}\` — ${expert.name}. ${description}${alias}`);
  }
  return lines.join("\n");
}
