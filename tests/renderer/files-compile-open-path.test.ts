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
    const langs = readFileSync(join(renderer, "lib/editor/language-mappings.tsx"), "utf8");
    expect(langs).toContain('".typ"');
    expect(langs).toContain("prism-typst-language");
  });

  it("does not ship a Typst WASM compiler in the renderer", () => {
    expect(existsSync(join(renderer, "lib/typst/typst-live-engine.ts"))).toBe(false);
    const preview = readFileSync(join(renderer, "lib/typst/typst-live-preview.tsx"), "utf8");
    expect(preview).not.toContain("LIVE_SHELL");
    expect(preview).toContain("<iframe");
    expect(preview).toContain("ensureTypstPreview");
    expect(preview).not.toContain("TypstCliLivePreview");
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

  it("mounts compile errors in the preview slot from a toolbar badge, not a bottom strip", () => {
    const layout = readFileSync(join(renderer, "lib/compile/file-compile-layout.tsx"), "utf8");
    const content = readFileSync(join(renderer, "modes/files-mode/files-content.tsx"), "utf8");
    const toolbar = readFileSync(join(renderer, "modes/files-mode/files-toolbar.tsx"), "utf8");
    expect(layout).not.toContain("CompileProblemsStrip");
    expect(layout).not.toContain("texworkspaceProblemsOpen");
    expect(content).toContain("CompileErrorPane");
    expect(toolbar).toContain("setCompileErrorPane");
    expect(toolbar).toContain("AlertCircleIcon");
  });

  it("routes .typ typing to the Tinymist session store, not LaTeX auto-compile", () => {
    const doc = readFileSync(join(renderer, "stores/document-store.ts"), "utf8");
    const compile = readFileSync(join(renderer, "stores/compile-store.ts"), "utf8");
    const live = readFileSync(join(renderer, "stores/typst-live-store.ts"), "utf8");
    const session = readFileSync(join(renderer, "stores/typst-session-store.ts"), "utf8");
    expect(doc).toContain("notifyTypstDidChange");
    expect(doc).not.toContain("scheduleTypstLive");
    expect(doc).not.toContain("scheduleTypstLiveCompile");
    expect(compile).not.toContain("scheduleTypstLiveCompile");
    expect(compile).toContain("AUTO_COMPILE_DEBOUNCE");
    expect(session).toContain("@/lib/desktop-api/typst");
    expect(session).toContain("typstDidChange");
    expect(session).toContain("onTypstDiagnostics");
    expect(session).toContain("onTypstScrollTo");
    expect(session).not.toContain("scheduleTypstLive");
    expect(session).not.toContain("REMOTE FALLBACK");
    expect(live).not.toContain("compileTypstLive");
    expect(live).not.toContain("scheduleTypstLive");
    expect(live).not.toContain("getTypstLivePages");
    expect(live).toContain("compileTypstPdf");
    expect(live).toContain("exportTypst");
    expect(live).not.toContain("AUTO_COMPILE_DEBOUNCE");
    expect(live).not.toContain("isAutoCompileEnabled");
    expect(compile).not.toContain("exportTypst");
    expect(compile).not.toContain("resolveTypstRootFromBuffers");
    expect(compile).not.toContain("compileTypstExport");
    expect(compile).not.toContain("compileTypstLive");
    const typstMain = readFileSync(join(here, "../../src/main/compile/typst.ts"), "utf8");
    expect(typstMain).not.toContain("compileTypstLiveSvg");
    expect(typstMain).not.toContain("typstWatchSvgArgs");
  });

  it("does not ship typst watch, compile:typstLive, or the CLI SVG webview", () => {
    const root = join(here, "../..");
    expect(existsSync(join(root, "src/main/compile/typst-live.ts"))).toBe(false);
    expect(existsSync(join(root, "src/main/compile/typst-binary.ts"))).toBe(false);
    expect(existsSync(join(root, "scripts/download-typst.sh"))).toBe(false);
    expect(existsSync(join(root, "scripts/typst-version.txt"))).toBe(false);
    expect(existsSync(join(root, "scripts/host/typst-linux.txt"))).toBe(false);
    expect(existsSync(join(renderer, "lib/typst/typst-cli-live-preview.tsx"))).toBe(false);
    expect(existsSync(join(root, "tests/main/typst-live-watch.test.ts"))).toBe(false);
    const ipc = readFileSync(join(root, "src/main/ipc/compile.ts"), "utf8");
    const host = readFileSync(join(root, "src/host/compile-handlers.ts"), "utf8");
    const preload = readFileSync(join(root, "src/preload/compile.ts"), "utf8");
    const desktop = readFileSync(join(renderer, "lib/desktop-api/compile.ts"), "utf8");
    const mainIndex = readFileSync(join(root, "src/main/index.ts"), "utf8");
    expect(ipc).not.toContain("compile:typstLive");
    expect(host).not.toContain("compile:typstLive");
    expect(preload).not.toContain("compileTypstLive");
    expect(desktop).not.toContain("compileTypstLive");
    expect(mainIndex).not.toContain("disposeTypstLiveWatchers");
    expect(mainIndex).toContain("killAllTinymistSessions");
  });
});
