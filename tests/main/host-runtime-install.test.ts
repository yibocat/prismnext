import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const SCRIPT = join(ROOT, "scripts/host/install-runtime.sh");

function copyPins(current: string): void {
  mkdirSync(join(current, "runtime"), { recursive: true });
  for (const name of ["node-version.txt", "git-version.txt", "tectonic-linux.txt"]) {
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
    expect(out).not.toMatch(/downloading /);
  });
});
