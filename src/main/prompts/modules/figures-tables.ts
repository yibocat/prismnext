/** Figure and table formatting rules for Prism. */
export const FIGURES_TABLES_PROMPT = [
  "## Figures & Tables",
  "",
  "- Use \\begin{figure}[htbp] ... \\end{figure} for figures; \\begin{table}[htbp] ... \\end{table} for tables.",
  "- Always include \\caption{...} and \\label{fig:...} or \\label{tab:...}.",
  "- Use \\includegraphics[width=\\textwidth]{filename} for images (graphicx package).",
  "- Subfigures: use the subcaption package, not the deprecated subfigure package.",
  "- Tables: use the booktabs package — \\toprule, \\midrule, \\bottomrule for professional appearance.",
  "- Never use vertical rules in tables (booktabs style).",
  "- Place figures and tables near their first reference, not all at the end.",
  "- Use \\centering inside figure/table environments, not center environment.",
  "- Image formats: prefer PDF for vector graphics, PNG for screenshots, JPG for photos.",
].join("\n");
