import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const renderer = join(here, "../../src/renderer");

describe("files compile open path", () => {
  it("opens .tex from Files via openFile, not the TeX singleton", () => {
    const sidebar = readFileSync(join(renderer, "modes/files-mode/files-sidebar.tsx"), "utf8");
    expect(sidebar).toContain("openFile(");
    expect(sidebar).not.toContain("openTexworkspaceFile");
  });

  it("does not hijack Files .tex tabs into TeX Workspace on compile", () => {
    const main = readFileSync(join(renderer, "components/layout/right-main-area.tsx"), "utf8");
    expect(main).not.toContain("pdfRevision");
    expect(main).not.toContain("switchToFile");
  });

  it("keeps FileCompileLayout free of texworkspace tab kind", () => {
    const layout = readFileSync(join(renderer, "lib/compile/file-compile-layout.tsx"), "utf8");
    expect(layout).not.toMatch(/kind === ["']texworkspace["']/);
  });

  it("opens .typ on FileCompileLayout with live SVG webview, PDF via toolbar", () => {
    const content = readFileSync(join(renderer, "modes/files-mode/files-content.tsx"), "utf8");
    const toolbar = readFileSync(join(renderer, "modes/files-mode/files-toolbar.tsx"), "utf8");
    expect(content).toContain("isCompileLayoutTab");
    expect(content).toContain("FileCompileLayout");
    expect(content).toContain("TypstLivePreview");
    expect(content).toContain('sourceMode="compile"');
    expect(content).toContain("skipPreviewPdfCompile");
    expect(toolbar).toContain("typstPdfPreview");
    expect(toolbar).toContain("typstExport");
    expect(toolbar).toContain("ZapIcon");
    expect(toolbar).not.toContain("typst-live-engine");
  });

  it("does not ship a Typst WASM compiler in the renderer", () => {
    expect(existsSync(join(renderer, "lib/typst/typst-live-engine.ts"))).toBe(false);
    const preview = readFileSync(join(renderer, "lib/typst/typst-live-preview.tsx"), "utf8");
    expect(preview).toContain("srcDoc");
    expect(preview).not.toContain("@myriaddreamin");
  });

  it("LaTeX Files toolbar uses Files copy, not TeX Workspace keys", () => {
    const toolbar = readFileSync(join(renderer, "modes/files-mode/files-toolbar.tsx"), "utf8");
    expect(toolbar).not.toContain("modes.texworkspace");
    expect(toolbar).toContain("modes.files.compileDocument");
  });

  it("pauses auto-compile for the duration of a chat turn", () => {
    const send = readFileSync(join(renderer, "stores/chat/send.ts"), "utf8");
    expect(send).toContain("pauseAutoCompileForAi(tabId)");
    expect(send).toContain("resumeAutoCompileAfterAi(tabId)");
  });

  it("mounts a keyed compile problems strip on Files .tex and .typ", () => {
    const layout = readFileSync(join(renderer, "lib/compile/file-compile-layout.tsx"), "utf8");
    expect(layout).toContain("CompileProblemsStrip");
    expect(layout).not.toContain("texworkspaceProblemsOpen");
  });

  it("routes .typ typing to SVG live compile, not PDF auto-compile", () => {
    const doc = readFileSync(join(renderer, "stores/document-store.ts"), "utf8");
    const store = readFileSync(join(renderer, "stores/compile-store.ts"), "utf8");
    expect(doc).toContain("scheduleTypstLiveCompile");
    expect(store).toContain("compileTypstLive");
    expect(store).toContain("exportTypst");
  });
});
