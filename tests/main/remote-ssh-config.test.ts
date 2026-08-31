import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadUserSshConfigHosts } from "../../src/main/remote/ssh-config";

describe("loadUserSshConfigHosts", () => {
  it("follows Include and lists concrete aliases", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-ssh-config-"));
    mkdirSync(join(dir, "config.d"));
    writeFileSync(
      join(dir, "config"),
      `Host lab
  HostName 10.0.0.2
  User alice
Include config.d/*
`,
      "utf8",
    );
    writeFileSync(
      join(dir, "config.d", "extra"),
      `Host gpu-box
  HostName gpu.example.com
  User ubuntu
`,
      "utf8",
    );
    const hosts = loadUserSshConfigHosts(join(dir, "config"));
    expect(hosts.map((h) => h.alias)).toEqual(["gpu-box", "lab"]);
    expect(hosts.find((h) => h.alias === "lab")?.hostname).toBe("10.0.0.2");
  });
});
