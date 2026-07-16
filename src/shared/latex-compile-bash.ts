/**
 * Detect shell invocations that run a TeX engine directly.
 * Those must use `latex-compile` so builds stay under `.prismnext/compile/`.
 */

import { TOOL_NAMES } from "./tool-names";

/** Engines Prism Next's compiler may spawn — never via agent bash. */
const LATEX_ENGINE =
  "(?:pdflatex|xelatex|lualatex|latexmk|tectonic)";

/**
 * Match engine as a command word (optionally path-qualified / sudo), including
 * after `&&`, `;`, `|`, or newlines. Does not match `which pdflatex` / `echo pdflatex`.
 */
const LATEX_ENGINE_COMMAND_RE = new RegExp(
  `(?:^|[;&|\\n]|&&|\\|\\|)\\s*(?:sudo\\s+)?(?:\\S*\\/)?${LATEX_ENGINE}(?=\\s|$)`,
  "i",
);

export function isDirectLatexCompileBashCommand(command: string): boolean {
  const c = command.trim();
  if (!c) return false;
  return LATEX_ENGINE_COMMAND_RE.test(c);
}

/** Tool-result / PTY gate message (same turn). */
export function latexCompileBashBlockMessage(): string {
  return (
    `Prism Next: do not compile LaTeX via bash (pdflatex / xelatex / lualatex / latexmk / tectonic). ` +
    `Use the \`${TOOL_NAMES.latexCompile}\` tool (or Cmd+Enter / \`/compile\`). ` +
    `Builds sync sources into \`.prismnext/compile/\` — running engines in the manuscript folder pollutes it with .aux/.log.`
  );
}

/** Injected on the next chat:send after ACP denies (permission reject has no reason string). */
export function latexCompileBashRedirectNote(): string {
  return (
    `A bash LaTeX compile was blocked. Call \`${TOOL_NAMES.latexCompile}\` in this conversation ` +
    `(after \`${TOOL_NAMES.latexRoot}\` if needed) — do not use pdflatex/latexmk/tectonic in the shell.`
  );
}
