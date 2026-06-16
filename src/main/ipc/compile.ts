import { ipcMain } from "electron";
import { compileLatex, synctexEdit, synctexForward } from "../services/compiler";
import { detectTexlive, detectTectonic } from "../services/texlive-detect";

export function registerCompileHandlers(): void {
  ipcMain.handle(
    "compile:execute",
    async (
      _event,
      args: { projectDir: string; mainFile: string; useTexlive?: boolean },
    ) => {
      console.log(`[compile:execute] projectDir=${args.projectDir} mainFile=${args.mainFile} useTexlive=${args.useTexlive ?? false}`);
      const result = await compileLatex(
        args.projectDir,
        args.mainFile,
        args.useTexlive,
      );
      if (result.success && result.pdfBytes) {
        console.log(`[compile:execute] SUCCESS — ${result.pdfBytes.length} bytes`);
        return { pdfBytes: result.pdfBytes, buildDir: result.buildDir, stdout: result.logContent };
      } else {
        console.log(`[compile:execute] FAILED — error: ${result.error || "unknown"}`);
        return { error: result.error || "Compilation failed", stdout: result.logContent };
      }
    },
  );

  ipcMain.handle(
    "compile:synctex",
    async (
      _event,
      args: { projectDir: string; page: number; x: number; y: number },
    ) => {
      return synctexEdit(args.projectDir, args.page, args.x, args.y);
    },
  );

  ipcMain.handle(
    "compile:synctexForward",
    async (
      _event,
      args: { projectDir: string; file: string; line: number },
    ) => {
      return synctexForward(args.projectDir, args.file, args.line);
    },
  );

  ipcMain.handle("compile:detectTexlive", async () => {
    const texliveStatus = await detectTexlive();
    const tectonicAvailable = await detectTectonic();
    return {
      texlive: texliveStatus,
      tectonic: tectonicAvailable,
    };
  });
}
