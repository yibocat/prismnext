import { compileLatex, detectTectonic, detectTexlive } from "../main/compile/facade";
import { compileEngineFromRelPath } from "../shared/compile/artifact-key";
import { TYPST_CLI_FORMATS, typstExportFileRel, typstVisibleExportDirRel, type TypstCliFormat } from "../shared/compile/typst-format";
import {
  compileTypstForIpc,
  compileTypstToFormat,
} from "../main/compile/typst";
import type { HostHandlerContext } from "./context";

function projectDir(params: Record<string, unknown>, ctx: HostHandlerContext): string {
  return typeof params.projectDir === "string" && params.projectDir.trim()
    ? params.projectDir
    : ctx.remoteRoot ?? "";
}

export const compileHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "compile:execute"(params, ctx) {
    const root = projectDir(params, ctx);
    const mainFile = String(params.mainFile ?? "");
    const compileOpts = {
      dirtyRelPaths: Array.isArray(params.dirtyRelPaths)
        ? params.dirtyRelPaths.filter((item): item is string => typeof item === "string")
        : undefined,
      dirtyFiles: Array.isArray(params.dirtyFiles)
        ? params.dirtyFiles as Array<{ relPath: string; content: string }>
        : undefined,
      pdfOnDisk: true,
      skipSynctex: params.skipSynctex === true,
      fast: params.fast === true,
      source: "ui" as const,
    };
    const result = compileEngineFromRelPath(mainFile) === "typst"
      ? await compileTypstForIpc(root, mainFile, compileOpts)
      : await compileLatex(root, mainFile, params.useTexlive === true, compileOpts);
    if (result.success) {
      return {
        pdfPath: result.pdfPath,
        buildDir: result.buildDir,
        stdout: result.logContent,
      };
    }
    return {
      error: result.error || "Compilation failed",
      stdout: result.logContent,
      code: result.error?.includes("tectonic")
        || result.error?.includes("Typst")
        || result.error?.includes("tex")
        ? "compile_engine_unavailable"
        : undefined,
    };
  },

  async "compile:typstExport"(params, ctx) {
    const root = projectDir(params, ctx);
    const mainFile = String(params.mainFile ?? "");
    const format = params.format as TypstCliFormat;
    if (!TYPST_CLI_FORMATS.includes(format)) {
      return { error: "bad-format" };
    }
    const dirtyFiles = Array.isArray(params.dirtyFiles)
      ? params.dirtyFiles as Array<{ relPath: string; content: string }>
      : undefined;
    const outDirRel =
      typeof params.outDirRel === "string" && params.outDirRel.trim()
        ? params.outDirRel
        : typstVisibleExportDirRel(mainFile);
    const result = await compileTypstToFormat(root, mainFile, format, { dirtyFiles, source: "ui" }, outDirRel);
    if (!result.success || !result.files?.length) {
      return { error: result.error || "Compilation failed", stdout: result.logContent };
    }
    return {
      files: result.files.map((file) => typstExportFileRel(result.buildDir, file.name)),
      buildDir: result.buildDir,
      stdout: result.logContent,
    };
  },

  async "compile:detectTexlive"() {
    const texlive = await detectTexlive();
    const tectonic = await detectTectonic();
    return { texlive, tectonic };
  },
};
