/** Academic writing conventions for Prism. */
export const ACADEMIC_WRITING_PROMPT = [
  "## Academic Writing",
  "",
  "- Use \\chapter for book/report classes; \\section, \\subsection, \\subsubsection for articles.",
  "- Abstract: use the abstract environment: \\begin{abstract} ... \\end{abstract}.",
  "- Use \\emph for emphasis (not \\textit or \\textbf for semantic emphasis).",
  "- Prefer semantic markup over visual formatting: use \\title, \\author, \\date for metadata.",
  "- Cross-references: \\label{key} + \\ref{key} (number) or \\cref{key} (with cleveref for type-aware refs).",
  "- Footnotes: \\footnote{text}. For author affiliations, use \\thanks{} inside \\author{}.",
  "- Use the hyperref package for clickable links and PDF metadata.",
  "- For linguistic examples, use packages like gb4e or linguex.",
].join("\n");
