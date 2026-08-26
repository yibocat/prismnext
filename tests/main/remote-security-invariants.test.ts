import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseListenBind } from "../../src/host/serve-listen";
import { buildHostEnsureListenScript } from "../../src/main/remote/host-listen";
import { stripAgentSecrets } from "../../src/shared/remote";

const REPO = join(__dirname, "../..");

describe("remote security invariants", () => {
  it("never binds Host listen on 0.0.0.0", () => {
    expect(parseListenBind("0.0.0.0:4312")).toBeNull();
    expect(parseListenBind("[::]:4312")).toBeNull();
    const script = buildHostEnsureListenScript({
      nodeBin: "/opt/node",
      hostBin: "/opt/host/bin/prismnext-host",
      currentDir: "/opt/host",
    });
    expect(script).toContain("127.0.0.1");
    expect(script).not.toContain("0.0.0.0");
    expect(script).toContain("'serve','--listen'");
  });

  it("does not depend on ssh2", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.ssh2).toBeUndefined();
    expect(pkg.devDependencies?.ssh2).toBeUndefined();
    expect(pkg.dependencies?.["@types/ssh2"]).toBeUndefined();
  });

  it("strips API keys before a frame leaves this computer", () => {
    expect(stripAgentSecrets({
      prompt: "hi",
      apiKey: "sk-secret",
      headers: { Authorization: "Bearer sk-secret" },
    })).toEqual({ prompt: "hi", headers: {} });
  });

  it("does not delete user data when swapping Host and does not gate on a license", () => {
    const bootstrap = readFileSync(join(REPO, "src/main/remote/bootstrap.ts"), "utf8");
    expect(bootstrap).toContain("Does not touch `~/.prismnext` user data");
    expect(bootstrap).not.toMatch(/rm\s+-rf/);
    const broker = readFileSync(join(REPO, "src/main/remote/session-broker.ts"), "utf8");
    expect(broker).not.toMatch(/checkLicense|requirePro|workspace\.remote|agent\.remote/);
    expect(broker).not.toMatch(/entitlement/);
  });
});
