/**
 * Detect shell invocations that run a TeX engine directly.
 * Those must use the host compile tools so engines never run via bash.
 */

import { TOOL_NAMES } from "../agent/tool-names";

/** Engines prismnext's compiler may spawn — never via agent bash. */
const LATEX_ENGINE =
  "(?:pdflatex|xelatex|lualatex|latexmk|tectonic|typst|tinymist)";

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
    `prismnext: do not compile LaTeX or Typst via bash (pdflatex / xelatex / lualatex / latexmk / tectonic / typst / tinymist). ` +
    `Use \`${TOOL_NAMES.latexCompile}\` for the LaTeX paper (artifacts in \`.workbench/compile/latex/\`). ` +
    `Use \`${TOOL_NAMES.latexCompileStandalone}\` for a \\documentclass{standalone} figure ` +
    `(PDF next to the source). ` +
    `Use \`${TOOL_NAMES.typstCompile}\` / \`${TOOL_NAMES.typstCompileStandalone}\` for Typst. ` +
    `Running engines via bash pollutes the source folder with aux files.`
  );
}

/** Injected on the next chat:send after ACP denies (permission reject has no reason string). */
export function latexCompileBashRedirectNote(): string {
  return (
    `A bash LaTeX/Typst compile was blocked. ` +
    `Call \`${TOOL_NAMES.latexCompile}\` / \`${TOOL_NAMES.latexCompileStandalone}\` for LaTeX, ` +
    `or \`${TOOL_NAMES.typstCompile}\` / \`${TOOL_NAMES.typstCompileStandalone}\` for Typst — ` +
    `do not use pdflatex/latexmk/tectonic/typst/tinymist in the shell.`
  );
}
