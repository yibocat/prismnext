import { afterEach, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getPath: () => tmpdir(),
    getAppPath: () => "/tmp/prism-not-electron",
  },
}));

import {
  isHostRuntimeProcess,
  resetTinymistBinaryCacheForTests,
  resolveBundledTinymistBinaryPath,
  resolveHostPayloadTinymistPath,
  resolveTinymistBinary,
  tinymistUnavailableError,
} from "../../src/main/compile/tinymist-binary";

describe("tinymist binary resolve", () => {
  const prev = process.env.PRISM_HOST_BIN_DIR;

  afterEach(() => {
    if (prev === undefined) delete process.env.PRISM_HOST_BIN_DIR;
    else process.env.PRISM_HOST_BIN_DIR = prev;
    resetTinymistBinaryCacheForTests();
  });

  it("resolves tinymist next to the dedicated Host node", () => {
    const bin = mkdtempSync(join(tmpdir(), "prism-host-tinymist-"));
    const tinymist = join(bin, "tinymist");
    writeFileSync(tinymist, "#!/bin/sh\necho tinymist 0.15.2\n");
    chmodSync(tinymist, 0o755);
    process.env.PRISM_HOST_BIN_DIR = bin;
    resetTinymistBinaryCacheForTests();
    expect(resolveHostPayloadTinymistPath()).toBe(tinymist);
  });

  it("finds tinymist under ~/.prismnext-host when Node is not the payload copy", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-tinymist-home-"));
    const bin = join(home, ".prismnext-host", "current", "bin");
    const tinymist = join(bin, "tinymist");
    mkdirSync(bin, { recursive: true });
    writeFileSync(tinymist, "#!/bin/sh\necho tinymist 0.15.2\n");
    chmodSync(tinymist, 0o755);
    delete process.env.PRISM_HOST_BIN_DIR;
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    resetTinymistBinaryCacheForTests();
    try {
      expect(resolveHostPayloadTinymistPath()).toBe(tinymist);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
    }
  });

  it("packaged layout is Resources/tinymist/tinymist", () => {
    const path = resolveBundledTinymistBinaryPath();
    expect(path.replace(/\\/g, "/")).toMatch(/\/tinymist\/tinymist(\.exe)?$/);
  });

  it("names Tinymist — not TeX Live — when the Host has no engine", () => {
    process.env.PRISM_HOST_BIN_DIR = "/tmp/prism-host-bin";
    expect(isHostRuntimeProcess()).toBe(true);
    expect(tinymistUnavailableError()).toMatch(/Tinymist was not found on this Host/);
    expect(tinymistUnavailableError()).not.toMatch(/TeX Live|TeXLive|xelatex/i);
  });

  it("prefers the Host payload binary over a missing Electron bundle", async () => {
    const bin = mkdtempSync(join(tmpdir(), "prism-host-tinymist-bin-"));
    const tinymist = join(bin, "tinymist");
    writeFileSync(tinymist, "#!/bin/sh\necho tinymist 0.15.2\n");
    chmodSync(tinymist, 0o755);
    process.env.PRISM_HOST_BIN_DIR = bin;
    resetTinymistBinaryCacheForTests();
    const info = await resolveTinymistBinary({ force: true });
    expect(info.available).toBe(true);
    expect(info.bundled).toBe(true);
    expect(info.path).toBe(tinymist);
  });
});
