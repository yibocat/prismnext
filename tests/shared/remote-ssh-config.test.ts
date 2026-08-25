import { describe, expect, it } from "vitest";
import { parseSshConfig, sshConfigHostToProfile } from "../../src/shared/remote";

const SAMPLE = `
# lab machines
Host *
  IdentitiesOnly yes

Host gpu-a.example.com gpu-b.example.com
  User ubuntu
  IdentityFile ~/.ssh/id_ed25519
  Port 22

Host github
  HostName github.com
  User git

Host jump-lab
  HostName 10.0.0.8
  User alice
  Port 2222
  ProxyJump bastion

Host "*"
  User ignore-me

Match host secret
  User hidden

Include config.d/*
Include ~/.ssh/extra
`;

describe("parseSshConfig", () => {
  it("lists concrete Host aliases and skips wildcards / Match", () => {
    const parsed = parseSshConfig(SAMPLE);
    const aliases = parsed.hosts.map((h) => h.alias);
    expect(aliases).toEqual([
      "gpu-a.example.com",
      "gpu-b.example.com",
      "github",
      "jump-lab",
    ]);
    expect(parsed.hosts.find((h) => h.alias === "github")).toEqual({
      alias: "github",
      hostname: "github.com",
      port: 22,
      user: "git",
    });
    expect(parsed.hosts.find((h) => h.alias === "jump-lab")).toMatchObject({
      hostname: "10.0.0.8",
      port: 2222,
      user: "alice",
      proxyJump: "bastion",
    });
    expect(parsed.includes).toEqual(["config.d/*", "~/.ssh/extra"]);
    expect(aliases).not.toContain("secret");
  });

  it("maps a config host to a broker profile whose id is the alias", () => {
    const host = parseSshConfig("Host lab\n  HostName 1.2.3.4\n  User me\n").hosts[0]!;
    expect(sshConfigHostToProfile(host)).toMatchObject({
      id: "lab",
      name: "lab",
      host: "1.2.3.4",
      user: "me",
    });
  });
});
