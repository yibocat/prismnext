export type TypstCliFormat = "pdf" | "png" | "svg" | "html";

export const TYPST_CLI_FORMATS: TypstCliFormat[] = ["pdf", "png", "svg", "html"];

/** Legacy compile-cache export path (hidden from the Files tree). */
export function typstExportDirRel(stem: string): string {
  return `.workbench/compile/typst/export/${stem}`;
}

/**
 * Visible export folder next to the source: `<dir>/export/<stem>/`.
 * Files can open these; `.workbench/compile/` cannot.
 */
export function typstVisibleExportDirRel(mainFile: string): string {
  const normalized = mainFile.replace(/\\/g, "/").replace(/^\.\//, "");
  const slash = normalized.lastIndexOf("/");
  const dir = slash >= 0 ? normalized.slice(0, slash) : "";
  const base = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base) || "export";
  return dir ? `${dir}/export/${stem}` : `export/${stem}`;
}

export function typstExportFileRel(buildDirRel: string, fileName: string): string {
  const dir = buildDirRel.replace(/\\/g, "/").replace(/\/$/, "");
  const name = fileName.replace(/\\/g, "/").replace(/^\/+/, "");
  return dir ? `${dir}/${name}` : name;
}

/** PNG / SVG emit one file per page and need a `{p}` template. */
export function typstOutputUsesPageTemplate(format: TypstCliFormat): boolean {
  return format === "png" || format === "svg";
}
