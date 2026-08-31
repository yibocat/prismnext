export type TypstCliFormat = "pdf" | "png" | "svg" | "html";

export const TYPST_CLI_FORMATS: TypstCliFormat[] = ["pdf", "png", "svg", "html"];

export function typstExportDirRel(stem: string): string {
  return `.workbench/compile/typst/export/${stem}`;
}

/** Legacy live SVG dir inside the paper. Do not write here — `typst watch --root` will loop. */
export function typstLegacyProjectLiveDirRel(stem: string): string {
  return `.workbench/compile/typst/live/${stem}`;
}

/** Multi-page SVG template. `{t}` is page count so a shorter doc cannot keep stale extra pages. */
export function typstLivePageFileTemplate(stem: string): string {
  return `${stem}-{p}-of-{t}.svg`;
}

/** PNG / SVG emit one file per page and need a `{p}` template. */
export function typstOutputUsesPageTemplate(format: TypstCliFormat): boolean {
  return format === "png" || format === "svg";
}
