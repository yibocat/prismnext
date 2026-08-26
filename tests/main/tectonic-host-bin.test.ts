import { afterEach, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
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
  resetTectonicBinaryCacheForTests,
  resolveHostPayloadTectonicPath,
  resolveTectonicBinary,
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
