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
  resetTypstBinaryCacheForTests,
  resolveHostPayloadTypstPath,
  resolveTypstBinary,
  typstUnavailableError,
} from "../../src/main/compile/typst-binary";

describe("Host payload typst", () => {
  const prev = process.env.PRISM_HOST_BIN_DIR;

  afterEach(() => {
    if (prev === undefined) delete process.env.PRISM_HOST_BIN_DIR;
    else process.env.PRISM_HOST_BIN_DIR = prev;
    resetTypstBinaryCacheForTests();
  });

  it("resolves typst next to the dedicated Host node", () => {
    const bin = mkdtempSync(join(tmpdir(), "prism-host-typst-"));
    const typst = join(bin, "typst");
    writeFileSync(typst, "#!/bin/sh\necho typst 0.15.1\n");
    chmodSync(typst, 0o755);
    process.env.PRISM_HOST_BIN_DIR = bin;
    resetTypstBinaryCacheForTests();
    expect(resolveHostPayloadTypstPath()).toBe(typst);
  });

  it("finds typst under ~/.prismnext-host when Node is not the payload copy", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-typst-home-"));
    const bin = join(home, ".prismnext-host", "current", "bin");
    const typst = join(bin, "typst");
    mkdirSync(bin, { recursive: true });
    writeFileSync(typst, "#!/bin/sh\necho typst 0.15.1\n");
    chmodSync(typst, 0o755);
    delete process.env.PRISM_HOST_BIN_DIR;
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    resetTypstBinaryCacheForTests();
    try {
      expect(resolveHostPayloadTypstPath()).toBe(typst);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
    }
  });

  it("names Typst — not TeX Live — when the Host has no engine", () => {
    process.env.PRISM_HOST_BIN_DIR = "/tmp/prism-host-bin";
    expect(isHostRuntimeProcess()).toBe(true);
    expect(typstUnavailableError()).toMatch(/Typst was not found on this Host/);
    expect(typstUnavailableError()).not.toMatch(/TeX Live|TeXLive|xelatex/i);
  });

  it("prefers the Host payload binary over a missing Electron bundle", async () => {
    const bin = mkdtempSync(join(tmpdir(), "prism-host-typst-bin-"));
    const typst = join(bin, "typst");
    writeFileSync(typst, "#!/bin/sh\necho typst 0.15.1\n");
    chmodSync(typst, 0o755);
    process.env.PRISM_HOST_BIN_DIR = bin;
    resetTypstBinaryCacheForTests();
    const info = await resolveTypstBinary({ force: true });
    expect(info.available).toBe(true);
    expect(info.bundled).toBe(true);
    expect(info.path).toBe(typst);
  });
});
