import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const SCRIPT = join(ROOT, "scripts/host/install-runtime.sh");

function copyPins(current: string): void {
  mkdirSync(join(current, "runtime"), { recursive: true });
  for (const name of ["node-version.txt", "git-version.txt", "tectonic-linux.txt", "typst-linux.txt"]) {
    writeFileSync(join(current, "runtime", name), readFileSync(join(ROOT, "scripts/host", name)));
  }
}

describe("host runtime installer plan", () => {
  it("prints official download URLs from pin files without hitting the network", () => {
    const current = mkdtempSync(join(tmpdir(), "prism-runtime-plan-"));
    copyPins(current);
    const out = execFileSync(
      "/bin/sh",
      [SCRIPT, "--current", current, "--arch", "x64", "--print-plan"],
      { encoding: "utf8" },
    );
    expect(out).toContain("https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.gz");
    expect(out).toContain("https://github.com/desktop/dugite-native/releases/download/");
    expect(out).toContain("ubuntu-x64.tar.gz");
    expect(out).toContain("https://github.com/tectonic-typesetting/tectonic/releases/download/");
    expect(out).toContain("x86_64-unknown-linux-musl");
    expect(out).toContain("https://github.com/typst/typst/releases/download/");
    expect(out).not.toMatch(/downloading /);
  });

  it("installs a cached ELF named .tar.gz into current/bin/tectonic without hitting the network", () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "prism-runtime-elf-"));
    const current = join(hostRoot, "current");
    copyPins(current);
    mkdirSync(join(hostRoot, "cache"), { recursive: true });
    mkdirSync(join(current, "bin"), { recursive: true });
    const cacheFile = join(
      hostRoot,
      "cache",
      "tectonic-0.15.0-x86_64-unknown-linux-musl.tar.gz",
    );
    writeFileSync(cacheFile, Buffer.concat([
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
      Buffer.from("#!/bin/sh\necho tectonic 0.15.0\n"),
    ]));
    execFileSync("/bin/chmod", ["755", cacheFile]);
    execFileSync("/bin/sh", [SCRIPT, "--current", current, "--arch", "x64", "--step", "tectonic"]);
    const dest = join(current, "bin", "tectonic");
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest).subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))).toBe(true);
    expect(existsSync(cacheFile)).toBe(true);
  });

  it("installs a cached ELF named .tar.xz into current/bin/typst without hitting the network", () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "prism-runtime-typst-elf-"));
    const current = join(hostRoot, "current");
    copyPins(current);
    mkdirSync(join(hostRoot, "cache"), { recursive: true });
    mkdirSync(join(current, "bin"), { recursive: true });
    const cacheFile = join(
      hostRoot,
      "cache",
      "typst-0.15.1-x86_64-unknown-linux-musl.tar.xz",
    );
    writeFileSync(cacheFile, Buffer.concat([
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
      Buffer.from("#!/bin/sh\necho typst 0.15.1\n"),
    ]));
    execFileSync("/bin/chmod", ["755", cacheFile]);
    execFileSync("/bin/sh", [SCRIPT, "--current", current, "--arch", "x64", "--step", "typst"]);
    const dest = join(current, "bin", "typst");
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest).subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))).toBe(true);
    expect(existsSync(cacheFile)).toBe(true);
  });
});
