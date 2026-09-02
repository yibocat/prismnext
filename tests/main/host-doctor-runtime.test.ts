import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor } from "../../src/host/doctor";

describe("Host doctor runtime inventory", () => {
  const prevHome = process.env.HOME;
  const prevBin = process.env.PRISM_HOST_BIN_DIR;
  const prevArgv1 = process.argv[1];

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevBin === undefined) delete process.env.PRISM_HOST_BIN_DIR;
    else process.env.PRISM_HOST_BIN_DIR = prevBin;
    process.argv[1] = prevArgv1;
  });

  it("reports payload node / git / tectonic without failing ok when TeX is missing", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-doc-"));
    const bin = join(home, ".prismnext-host", "current", "bin");
    const gitDir = join(home, ".prismnext-host", "current", "vendor", "git", "bin");
    mkdirSync(bin, { recursive: true });
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(join(bin, "prismnext-host"), "#!/usr/bin/env node\n");
    writeFileSync(join(bin, "node"), "#!/bin/sh\necho v24.19.0\n");
    writeFileSync(join(gitDir, "git"), "#!/bin/sh\necho git version 2.53.0\n");
    chmodSync(join(bin, "node"), 0o755);
    chmodSync(join(gitDir, "git"), 0o755);
    process.env.HOME = home;
    process.env.PRISM_HOST_BIN_DIR = bin;
    process.argv[1] = join(bin, "prismnext-host");

    const report = await runDoctor();
    expect(report.ok).toBe(true);
    expect(report.runtime?.node.available).toBe(true);
    expect(report.runtime?.node.path).toBe(join(bin, "node"));
    expect(report.runtime?.git.available).toBe(true);
    expect(report.runtime?.git.path).toBe(join(gitDir, "git"));
    expect(report.runtime?.tectonic.available).toBe(false);
    expect(report.runtime?.tectonic.path).toBeNull();
    expect(report.runtime?.tinymist.available).toBe(false);
    expect(report.runtime?.tinymist.path).toBeNull();
    expect(report.runtime?.anydoc.available).toBe(false);
    expect(report.runtime?.anydoc.path).toBeNull();
  });

  it("finds tectonic next to the Host script", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-doc-tex-"));
    const bin = join(home, ".prismnext-host", "current", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "prismnext-host"), "#!/usr/bin/env node\n");
    writeFileSync(join(bin, "tectonic"), "#!/bin/sh\necho tectonic 0.15.0\n");
    chmodSync(join(bin, "tectonic"), 0o755);
    process.env.HOME = home;
    process.env.PRISM_HOST_BIN_DIR = bin;
    process.argv[1] = join(bin, "prismnext-host");

    const report = await runDoctor();
    expect(report.ok).toBe(true);
    expect(report.runtime?.tectonic.available).toBe(true);
    expect(report.runtime?.tectonic.path).toBe(join(bin, "tectonic"));
    expect(report.runtime?.tectonic.version).toMatch(/0\.15\.0/);
  });
});
