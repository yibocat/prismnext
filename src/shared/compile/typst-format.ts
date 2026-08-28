export type TypstCliFormat = "pdf" | "png" | "svg" | "html";

export const TYPST_CLI_FORMATS: TypstCliFormat[] = ["pdf", "png", "svg", "html"];

export function typstLiveDirRel(stem: string): string {
  return `.workbench/compile/typst/live/${stem}`;
}

export function typstExportDirRel(stem: string): string {
  return `.workbench/compile/typst/export/${stem}`;
}

/** PNG / SVG emit one file per page and need a `{p}` template. */
export function typstOutputUsesPageTemplate(format: TypstCliFormat): boolean {
  return format === "png" || format === "svg";
}
