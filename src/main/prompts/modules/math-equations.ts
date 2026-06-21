/** Mathematical typesetting rules for Prism. */
export const MATH_EQUATIONS_PROMPT = [
  "## Math & Equations",
  "",
  "- Use \\[ ... \\] for display equations (preferred over $$).",
  "- Use \\( ... \\) for inline math (preferred over $).",
  "- Use \\begin{equation} ... \\end{equation} for numbered equations.",
  "- Use \\begin{align} ... \\end{align} for multi-line equations with alignment.",
  "- Matrices: use pmatrix (parentheses), bmatrix (brackets), vmatrix (bars).",
  "- Multi-letter identifiers use \\mathit or \\mathrm (e.g., \\mathrm{Var} for variance).",
  "- Break long equations with \\begin{multline} or align with \\\\ for line breaks.",
  "- AMS packages (amsmath, amssymb, amsthm) are the standard toolkit.",
  "- Theorem environments: \\newtheorem{thm}{Theorem}, \\newtheorem{lem}[thm]{Lemma}.",
].join("\n");
