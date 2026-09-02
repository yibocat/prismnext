import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const SCRIPT = join(ROOT, "scripts/host/install-runtime.sh");

function copyPins(current: string): void {
  mkdirSync(join(current, "runtime"), { recursive: true });
  for (const name of ["node-version.txt", "git-version.txt", "tectonic-linux.txt", "tinymist-linux.txt", "anydoc-linux.txt"]) {
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
    expect(out).toContain("https://github.com/Myriad-Dreamin/tinymist/releases/download/");
    expect(out).toContain("https://github.com/firecrawl/anydoc/releases/download/v0.2.4/anydoc.linux-x64-gnu.node");
    expect(out).toContain("https://registry.npmjs.org/@firecrawl/anydoc-linux-x64-gnu/-/anydoc-linux-x64-gnu-0.2.4.tgz");
    expect(out).not.toContain("https://github.com/typst/typst/releases/download/");
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

  it("installs a cached ELF named .tar.gz into current/bin/tinymist without hitting the network", () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "prism-runtime-tinymist-elf-"));
    const current = join(hostRoot, "current");
    copyPins(current);
    mkdirSync(join(hostRoot, "cache"), { recursive: true });
    mkdirSync(join(current, "bin"), { recursive: true });
    const cacheFile = join(
      hostRoot,
      "cache",
      "tinymist-0.15.2-x86_64-unknown-linux-musl.tar.gz",
    );
    writeFileSync(cacheFile, Buffer.concat([
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
      Buffer.from("#!/bin/sh\necho tinymist 0.15.2\n"),
    ]));
    execFileSync("/bin/chmod", ["755", cacheFile]);
    execFileSync("/bin/sh", [SCRIPT, "--current", current, "--arch", "x64", "--step", "tinymist"]);
    const dest = join(current, "bin", "tinymist");
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest).subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))).toBe(true);
    expect(existsSync(cacheFile)).toBe(true);
  });

  it("replaces a leftover bin/tinymist directory even when the runtime stamp already matches", () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "prism-runtime-tinymist-dir-"));
    const current = join(hostRoot, "current");
    copyPins(current);
    mkdirSync(join(hostRoot, "cache"), { recursive: true });
    const dest = join(current, "bin", "tinymist");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "stale"), "not-a-binary");
    writeFileSync(join(hostRoot, "runtime-stamp.txt"), "tinymist 0.15.2\n");
    const cacheFile = join(
      hostRoot,
      "cache",
      "tinymist-0.15.2-x86_64-unknown-linux-musl.tar.gz",
    );
    writeFileSync(cacheFile, Buffer.concat([
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
      Buffer.from("#!/bin/sh\necho tinymist 0.15.2\n"),
    ]));
    execFileSync("/bin/chmod", ["755", cacheFile]);
    execFileSync("/bin/sh", [SCRIPT, "--current", current, "--arch", "x64", "--step", "tinymist"]);
    expect(statSync(dest).isFile()).toBe(true);
    expect(statSync(dest).size).toBeGreaterThan(0);
    expect(readFileSync(dest).subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))).toBe(true);
  });

  it("installs tinymist from a gzip tar that nests the binary", () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "prism-runtime-tinymist-tar-"));
    const current = join(hostRoot, "current");
    copyPins(current);
    mkdirSync(join(hostRoot, "cache"), { recursive: true });
    mkdirSync(join(current, "bin"), { recursive: true });
    const payloadDir = mkdtempSync(join(tmpdir(), "prism-tinymist-payload-"));
    const nested = join(payloadDir, "tinymist-x86_64-unknown-linux-musl");
    mkdirSync(nested);
    writeFileSync(join(nested, "tinymist"), Buffer.concat([
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
      Buffer.from("#!/bin/sh\necho tinymist 0.15.2\n"),
    ]));
    execFileSync("/bin/chmod", ["755", join(nested, "tinymist")]);
    const cacheFile = join(
      hostRoot,
      "cache",
      "tinymist-0.15.2-x86_64-unknown-linux-musl.tar.gz",
    );
    execFileSync("tar", ["-czf", cacheFile, "-C", payloadDir, "tinymist-x86_64-unknown-linux-musl"]);
    const digest = createHash("sha256").update(readFileSync(cacheFile)).digest("hex");
    const pinPath = join(current, "runtime", "tinymist-linux.txt");
    writeFileSync(
      pinPath,
      readFileSync(pinPath, "utf8").replace(/^sha256-x64 .+$/m, `sha256-x64 ${digest}`),
    );
    execFileSync("/bin/sh", [SCRIPT, "--current", current, "--arch", "x64", "--step", "tinymist"]);
    const dest = join(current, "bin", "tinymist");
    expect(statSync(dest).isFile()).toBe(true);
    expect(readFileSync(dest).subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))).toBe(true);
  });

  it("installs AnyDoc from a cached GitHub .node without hitting the network", () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "prism-runtime-anydoc-node-"));
    const current = join(hostRoot, "current");
    copyPins(current);
    mkdirSync(join(hostRoot, "cache"), { recursive: true });
    const cacheFile = join(hostRoot, "cache", "anydoc.linux-x64-gnu.node");
    writeFileSync(cacheFile, "native-binding\n");
    const digest = createHash("sha256").update(readFileSync(cacheFile)).digest("hex");
    const pinPath = join(current, "runtime", "anydoc-linux.txt");
    writeFileSync(
      pinPath,
      readFileSync(pinPath, "utf8").replace(/^native-sha256-x64 .+$/m, `native-sha256-x64 ${digest}`),
    );
    execFileSync("/bin/sh", [SCRIPT, "--current", current, "--host-root", hostRoot, "--arch", "x64", "--step", "anydoc"]);
    const dest = join(current, "node_modules/@firecrawl/anydoc-linux-x64-gnu/anydoc.linux-x64-gnu.node");
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, "utf8")).toContain("native-binding");
  });

  it("installs AnyDoc native from a cached npm tarball without hitting the network", () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "prism-runtime-anydoc-"));
    const current = join(hostRoot, "current");
    copyPins(current);
    mkdirSync(join(hostRoot, "cache"), { recursive: true });
    const payloadDir = mkdtempSync(join(tmpdir(), "prism-anydoc-payload-"));
    mkdirSync(join(payloadDir, "package"));
    writeFileSync(join(payloadDir, "package", "package.json"), JSON.stringify({
      name: "@firecrawl/anydoc-linux-x64-gnu",
      version: "0.2.4",
    }));
    writeFileSync(join(payloadDir, "package", "anydoc.linux-x64-gnu.node"), "native-binding\n");
    const cacheFile = join(hostRoot, "cache", "anydoc-linux-x64-gnu-0.2.4.tgz");
    execFileSync("tar", ["-czf", cacheFile, "-C", payloadDir, "package"]);
    const digest = createHash("sha256").update(readFileSync(cacheFile)).digest("hex");
    const pinPath = join(current, "runtime", "anydoc-linux.txt");
    writeFileSync(
      pinPath,
      readFileSync(pinPath, "utf8").replace(/^tgz-sha256-x64 .+$/m, `tgz-sha256-x64 ${digest}`),
    );
    execFileSync("/bin/sh", [SCRIPT, "--current", current, "--host-root", hostRoot, "--arch", "x64", "--step", "anydoc"]);
    const dest = join(current, "node_modules/@firecrawl/anydoc-linux-x64-gnu/anydoc.linux-x64-gnu.node");
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, "utf8")).toContain("native-binding");
  });

  it("installs AnyDoc when the .node is a symlink inside the npm tarball", () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "prism-runtime-anydoc-link-"));
    const current = join(hostRoot, "current");
    copyPins(current);
    mkdirSync(join(hostRoot, "cache"), { recursive: true });
    const payloadDir = mkdtempSync(join(tmpdir(), "prism-anydoc-link-payload-"));
    mkdirSync(join(payloadDir, "package", "prebuilds"), { recursive: true });
    writeFileSync(join(payloadDir, "package", "package.json"), JSON.stringify({
      name: "@firecrawl/anydoc-linux-x64-gnu",
      version: "0.2.4",
    }));
    writeFileSync(join(payloadDir, "package", "prebuilds", "anydoc.linux-x64-gnu.node"), "native-binding\n");
    execFileSync("ln", [
      "-s",
      "prebuilds/anydoc.linux-x64-gnu.node",
      join(payloadDir, "package", "anydoc.linux-x64-gnu.node"),
    ]);
    const cacheFile = join(hostRoot, "cache", "anydoc-linux-x64-gnu-0.2.4.tgz");
    execFileSync("tar", ["-czf", cacheFile, "-C", payloadDir, "package"]);
    const digest = createHash("sha256").update(readFileSync(cacheFile)).digest("hex");
    const pinPath = join(current, "runtime", "anydoc-linux.txt");
    writeFileSync(
      pinPath,
      readFileSync(pinPath, "utf8").replace(/^tgz-sha256-x64 .+$/m, `tgz-sha256-x64 ${digest}`),
    );
    execFileSync("/bin/sh", [SCRIPT, "--current", current, "--host-root", hostRoot, "--arch", "x64", "--step", "anydoc"]);
    const dest = join(current, "node_modules/@firecrawl/anydoc-linux-x64-gnu/anydoc.linux-x64-gnu.node");
    expect(statSync(dest).isFile()).toBe(true);
    expect(readFileSync(dest, "utf8")).toContain("native-binding");
  });
});
