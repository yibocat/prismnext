export type TexEngine = "pdflatex" | "xelatex" | "lualatex";
export type BibTool = "biber" | "bibtex" | null;

function lines(text: string): string[] {
  return text.split("\n");
}

/**
 * Detect TeX engine from % !TEX program magic comment.
 */
export function detectTexEngine(content: string): TexEngine | null {
  for (const line of lines(content).slice(0, 20)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("%")) continue;
    const rest = trimmed.slice(1).trim();
    if (!rest.startsWith("!TEX")) continue;
    const afterTex = rest.slice(5).trim();
    if (!afterTex.startsWith("program")) continue;
    const afterProgram = afterTex.slice(7).trim();
    if (!afterProgram.startsWith("=")) continue;
    const engine = afterProgram.slice(1).trim().toLowerCase();
    if (engine === "xelatex") return "xelatex";
    if (engine === "lualatex") return "lualatex";
    if (engine === "pdflatex" || engine === "latex") return "pdflatex";
  }
  return null;
}

/**
 * Detect bibliography tool from content.
 * biblatex defaults to biber; respect explicit backend=bibtex.
 */
export function detectBibTool(content: string): BibTool {
  const flat = content.replace(/\s+/g, " ");
  if (flat.includes("biblatex")) {
    if (/backend\s*=\s*bibtex/i.test(flat)) return "bibtex";
    if (/backend\s*=\s*biber/i.test(flat)) return "biber";
    return "biber";
  }
  for (const line of lines(content)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("%")) continue;
    if (trimmed.includes("\\bibliography{") || trimmed.includes("\\addbibresource{")) {
      return "bibtex";
    }
  }
  return null;
}
