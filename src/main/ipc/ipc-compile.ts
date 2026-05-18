import { ipcMain } from "electron";
import { compileLatex, synctexEdit } from "../services/compiler";
import { detectTexlive, detectTectonic } from "../services/texlive-detect";

export function registerCompileHandlers(): void {
  ipcMain.handle(
    "compile:execute",
    async (
      _event,
      args: { projectDir: string; mainFile: string; useTexlive?: boolean },
    ) => {
      const result = await compileLatex(
        args.projectDir,
        args.mainFile,
        args.useTexlive,
      );
      if (result.success && result.pdfBytes) {
        return { pdfBytes: result.pdfBytes };
      } else {
        return { error: result.error || "Compilation failed" };
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

  ipcMain.handle("compile:detectTexlive", async () => {
    const texliveStatus = await detectTexlive();
    const tectonicAvailable = await detectTectonic();
    return {
      texlive: texliveStatus,
      tectonic: tectonicAvailable,
    };
  });
}
