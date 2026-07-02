/** Citation & bibliography management rules for Prism. */
export const CITATIONS_PROMPT = [
  "## Citations & Bibliography",
  "",
  "- Use \\cite{key} for parenthetical citations and \\textcite{key} for in-text citations.",
  "- Manage references with BibTeX (.bib files); use \\bibliography{filename} to include them.",
  "- The bib tool is auto-detected: biblatex uses biber, traditional LaTeX uses bibtex.",
  "- For biblatex users, prefer \\addbibresource{refs.bib} over \\bibliography{}.",
  "- When adding a new reference, use Google Scholar's BibTeX export or doi2bib.org.",
  "- Always check that every \\cite key has a matching entry in the .bib file.",
  "- Common biblatex commands: \\textcite (author in text), \\parencite (parenthetical),",
  "  \\footcite (footnote), \\autocite (context-sensitive).",
].join("\n");
