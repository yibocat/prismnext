import { TOOL_NAMES } from "../../../shared/tool-names";

export const PROJECT_RULES_MEMORY_PROMPT = [
  "## Project rules memory",
  "",
  `Persist stable user preferences into project rules via \`${TOOL_NAMES.projectRuleWrite}\`.`,
  "",
  "### When",
  "- **Explicit remember** — user says remember / always do this / write a rule → call the tool.",
  "- **Heuristic** — repeated corrections that form a lasting preference → AskQuestion first; write only if they agree.",
  "- Do not persist one-off turn instructions, secrets, or API keys.",
  "",
  "### What to store",
  "- Citation style, formatting, standing constraints → project rule (`apply: always`).",
  "- Project structure and workflow narrative → AGENTS.md, not a rule.",
  "- Prefer **append** to a related existing rule over many tiny rules.",
  "",
  "### After writing",
  "- Tell the user which rule was saved (name + one-line summary).",
].join("\n");
