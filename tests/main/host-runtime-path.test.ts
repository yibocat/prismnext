import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyHostRuntimePath, resolveHostRuntimeBinDir } from "../../src/host/runtime-path";

describe("Host runtime PATH", () => {
  const prevPath = process.env.PATH;
  const prevBin = process.env.PRISM_HOST_BIN_DIR;
  const prevHome = process.env.HOME;
  const prevArgv1 = process.argv[1];

  afterEach(() => {
    process.env.PATH = prevPath;
    if (prevBin === undefined) delete process.env.PRISM_HOST_BIN_DIR;
    else process.env.PRISM_HOST_BIN_DIR = prevBin;
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    process.argv[1] = prevArgv1;
  });

  it("finds current/bin from the Host script when execPath is system Node", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-rt-"));
    const bin = join(home, ".prismnext-host", "current", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "prismnext-host"), "#!/usr/bin/env node\n");
    delete process.env.PRISM_HOST_BIN_DIR;
    process.env.HOME = home;
    process.argv[1] = join(bin, "prismnext-host");

    expect(resolveHostRuntimeBinDir()).toBe(bin);

    applyHostRuntimePath();
    expect(process.env.PRISM_HOST_BIN_DIR).toBe(bin);
    expect(process.env.PATH?.split(":")[0]).toBe(bin);
  });
});
