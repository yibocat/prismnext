import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => tmpdir(),
    getAppPath: () => process.cwd(),
  },
}));

import {
  disposeAllTinymistSessions,
  ensureTinymistSession,
  previewUrlFromLaunch,
  tinymistInitializeParams,
  TinymistSession,
} from "../../src/main/compile/tinymist-session";

describe("previewUrlFromLaunch", () => {
  it("builds http://127.0.0.1 from staticServerPort", () => {
    expect(previewUrlFromLaunch({ staticServerPort: 23625 })).toBe("http://127.0.0.1:23625/");
  });

  it("prefers staticServerAddr when present", () => {
    expect(previewUrlFromLaunch({
      staticServerAddr: "127.0.0.1:9999",
      staticServerPort: 1,
    })).toBe("http://127.0.0.1:9999/");
  });

  it("throws when neither port nor addr is present", () => {
    expect(() => previewUrlFromLaunch({})).toThrow(/staticServerPort/);
  });
});

describe("tinymistInitializeParams", () => {
  it("sends rootUri and executeCommand capability", () => {
    const params = tinymistInitializeParams("/tmp/paper");
    expect(params.rootUri).toMatch(/^file:\/\//);
    expect(params.rootUri).toContain("paper");
    expect(params.capabilities.workspace.executeCommand).toEqual({ dynamicRegistration: false });
    expect(params.initializationOptions.exportPdf).toBe("never");
    expect(params.initializationOptions.preview.refresh).toBe("onType");
    expect(params.workspaceFolders?.[0]?.uri).toBe(params.rootUri);
  });
});

describe("resolveTinymistConfigurationItems", () => {
  it("answers preview.refresh as onType for LSP workspace/configuration", async () => {
    const { resolveTinymistConfigurationItems } = await import("../../src/shared/typst/lsp");
    expect(
      resolveTinymistConfigurationItems({
        items: [{ section: "tinymist.preview.refresh" }],
      }),
    ).toEqual(["onType"]);
    expect(
      resolveTinymistConfigurationItems({
        items: [{ section: "tinymist" }],
      })[0],
    ).toMatchObject({ preview: { refresh: "onType" } });
  });
});

function bundledTinymist(): string | undefined {
  const plat =
    process.platform === "darwin" ? "darwin"
    : process.platform === "linux" ? "linux"
    : process.platform === "win32" ? "windows"
    : process.platform;
  const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : process.arch;
  const name = process.platform === "win32" ? "tinymist.exe" : "tinymist";
  const candidate = join(process.cwd(), "bin/tinymist", `${plat}-${arch}`, name);
  return existsSync(candidate) ? candidate : undefined;
}

const binary = bundledTinymist();

describe.skipIf(!binary)("TinymistSession against pinned binary", () => {
  let session: TinymistSession | undefined;

  afterEach(async () => {
    await session?.dispose().catch(() => undefined);
    session = undefined;
  });

  it("initializes, opens a fixture, and starts a localhost preview", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-tinymist-sess-"));
    const text = "#set page(width: 8cm, height: 4cm)\nHello, PrismNext.\n";
    writeFileSync(join(dir, "hello.typ"), text);
    session = await TinymistSession.start(binary!, dir);
    await session.didOpen({
      projectRoot: dir,
      relPath: "hello.typ",
      version: 1,
      text,
    });
    const ready = await session.startPreview("hello.typ");
    expect(ready.previewUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(ready.taskId).toBeTruthy();
    const res = await fetch(ready.previewUrl);
    expect(res.ok).toBe(true);
    await session.stopPreview("hello.typ");
  }, 45_000);

  it("promotes didChange to didOpen when the buffer was never opened", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-tinymist-change-"));
    writeFileSync(join(dir, "hello.typ"), "#set page(width: 8cm, height: 4cm)\nDISK\n");
    session = await TinymistSession.start(binary!, dir);
    await session.didChange({
      projectRoot: dir,
      relPath: "hello.typ",
      version: 1,
      text: "#set page(width: 8cm, height: 4cm)\nMEMORY\n",
    });
    const ready = await session.startPreview("hello.typ");
    expect(ready.previewUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const res = await fetch(ready.previewUrl);
    expect(res.ok).toBe(true);
    await session.stopPreview("hello.typ");
  }, 45_000);
});

describe.skipIf(!binary)("ensureTinymistSession", () => {
  afterEach(async () => {
    await disposeAllTinymistSessions();
  });

  it("single-flights concurrent callers onto one process", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-tinymist-ensure-"));
    writeFileSync(join(dir, "hello.typ"), "Hello\n");
    const [a, b] = await Promise.all([
      ensureTinymistSession(dir),
      ensureTinymistSession(dir),
    ]);
    expect(a).toBe(b);
    expect(await ensureTinymistSession(dir)).toBe(a);
  }, 45_000);
});
