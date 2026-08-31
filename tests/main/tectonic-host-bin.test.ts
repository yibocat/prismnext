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
  resetTectonicBinaryCacheForTests,
  resolveHostPayloadTectonicPath,
  resolveTectonicBinary,
  tectonicUnavailableError,
} from "../../src/main/compile/tectonic-binary";

describe("Host payload tectonic", () => {
  const prev = process.env.PRISM_HOST_BIN_DIR;

  afterEach(() => {
    if (prev === undefined) delete process.env.PRISM_HOST_BIN_DIR;
    else process.env.PRISM_HOST_BIN_DIR = prev;
    resetTectonicBinaryCacheForTests();
  });

  it("resolves tectonic next to the dedicated Host node", () => {
    const bin = mkdtempSync(join(tmpdir(), "prism-host-bin-"));
    const tectonic = join(bin, "tectonic");
    writeFileSync(tectonic, "#!/bin/sh\necho tectonic 0.15.0\n");
    chmodSync(tectonic, 0o755);
    process.env.PRISM_HOST_BIN_DIR = bin;
    resetTectonicBinaryCacheForTests();
    expect(resolveHostPayloadTectonicPath()).toBe(tectonic);
  });

  it("finds tectonic under ~/.prismnext-host when Node is not the payload copy", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-home-"));
    const bin = join(home, ".prismnext-host", "current", "bin");
    const tectonic = join(bin, "tectonic");
    mkdirSync(bin, { recursive: true });
    writeFileSync(tectonic, "#!/bin/sh\necho tectonic 0.15.0\n");
    chmodSync(tectonic, 0o755);
    delete process.env.PRISM_HOST_BIN_DIR;
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    resetTectonicBinaryCacheForTests();
    try {
      expect(resolveHostPayloadTectonicPath()).toBe(tectonic);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
    }
  });

  it("names Tectonic — not TeX Live — when the Host has no engine", () => {
    process.env.PRISM_HOST_BIN_DIR = "/tmp/prism-host-bin";
    expect(isHostRuntimeProcess()).toBe(true);
    expect(tectonicUnavailableError()).toMatch(/Tectonic was not found on this Host/);
    expect(tectonicUnavailableError()).not.toMatch(/TeXLive|xelatex/i);
  });

  it("prefers the Host payload binary over a missing Electron bundle", async () => {
    const bin = mkdtempSync(join(tmpdir(), "prism-host-bin-"));
    const tectonic = join(bin, "tectonic");
    writeFileSync(tectonic, "#!/bin/sh\necho tectonic 0.15.0\n");
    chmodSync(tectonic, 0o755);
    process.env.PRISM_HOST_BIN_DIR = bin;
    resetTectonicBinaryCacheForTests();
    const info = await resolveTectonicBinary({ force: true });
    expect(info.available).toBe(true);
    expect(info.bundled).toBe(true);
    expect(info.path).toBe(tectonic);
  });
});
