import { compileLatex, detectTectonic, detectTexlive } from "../main/compile/facade";
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
    const result = await compileLatex(root, mainFile, params.useTexlive === true, {
      dirtyRelPaths: Array.isArray(params.dirtyRelPaths)
        ? params.dirtyRelPaths.filter((item): item is string => typeof item === "string")
        : undefined,
      dirtyFiles: Array.isArray(params.dirtyFiles)
        ? params.dirtyFiles as Array<{ relPath: string; content: string }>
        : undefined,
      pdfOnDisk: true,
      skipSynctex: params.skipSynctex === true,
      fast: params.fast === true,
      source: "ui",
    });
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
      code: result.error?.includes("tectonic") || result.error?.includes("tex")
        ? "compile_engine_unavailable"
        : undefined,
    };
  },

  async "compile:detectTexlive"() {
    const texlive = await detectTexlive();
    const tectonic = await detectTectonic();
    return { texlive, tectonic };
  },
};
