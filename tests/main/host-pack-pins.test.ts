import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");

function pinMap(filePath: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.replace(/#.*$/, "").trim();
    if (!trimmed) continue;
    const space = trimmed.indexOf(" ");
    if (space < 0) continue;
    map[trimmed.slice(0, space)] = trimmed.slice(space + 1).trim();
  }
  return map;
}

describe("host pack pins", () => {
  it("reads git / node / tectonic from pin files and does not download binaries at pack time", () => {
    const pack = readFileSync(join(ROOT, "scripts/host/package-host.mjs"), "utf8");
    expect(pack).toContain("scripts/host/git-version.txt");
    expect(pack).toContain("scripts/host/node-version.txt");
    expect(pack).toContain("scripts/host/tectonic-linux.txt");
    expect(pack).toContain("scripts/host/typst-linux.txt");
    expect(pack).toContain("install-runtime.sh");
    expect(pack).toContain("prismnext-host.tar.gz");
    expect(pack).not.toContain("DUGITE_TAG");
    expect(pack).not.toContain("ensureOfficialNode");
    expect(pack).not.toContain("ensureLinuxGit");
    expect(pack).not.toContain("ensureLinuxTectonic");
    expect(pack).not.toContain("nodejs.org/dist");
    expect(pack).not.toContain("dugite-native");
  });

  it("pins Node, Git, and Tectonic with sha256 for both Linux arches", () => {
    const node = pinMap(join(ROOT, "scripts/host/node-version.txt"));
    const git = pinMap(join(ROOT, "scripts/host/git-version.txt"));
    const tectonic = pinMap(join(ROOT, "scripts/host/tectonic-linux.txt"));
    const typst = pinMap(join(ROOT, "scripts/host/typst-linux.txt"));
    const sha = /^[0-9a-f]{64}$/;
    expect(node.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(node.archive).toContain("{arch}");
    expect(node["sha256-x64"]).toMatch(sha);
    expect(node["sha256-arm64"]).toMatch(sha);
    expect(git.tag).toBeTruthy();
    expect(git.archive).toContain("{arch}");
    expect(git["sha256-x64"]).toMatch(sha);
    expect(git["sha256-arm64"]).toMatch(sha);
    expect(tectonic.version).toBeTruthy();
    expect(tectonic["triple-x64"]).toContain("linux");
    expect(tectonic["triple-arm64"]).toContain("linux");
    expect(tectonic["sha256-x64"]).toMatch(sha);
    expect(tectonic["sha256-arm64"]).toMatch(sha);
    expect(typst.version).toBeTruthy();
    expect(typst["triple-x64"]).toContain("linux");
    expect(typst["triple-arm64"]).toContain("linux");
    expect(typst["sha256-x64"]).toMatch(sha);
    expect(typst["sha256-arm64"]).toMatch(sha);
  });
});
