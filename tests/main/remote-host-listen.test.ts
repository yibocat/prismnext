import { describe, expect, it } from "vitest";
import { buildHostEnsureListenScript, parseListenPort } from "../../src/main/remote/host-listen";

describe("host listen helpers", () => {
  it("parses the listen port from a remote script reply", () => {
    expect(parseListenPort({ stdout: "43127", stderr: "", code: 0 })).toBe(43127);
    expect(parseListenPort({ stdout: "", stderr: "nope", code: 1 })).toBeNull();
  });

  it("starts Host on 127.0.0.1 and waits for the port", () => {
    const script = buildHostEnsureListenScript({
      nodeBin: "/opt/node",
      hostBin: "/opt/current/bin/prismnext-host",
    });
    expect(script).toContain("127.0.0.1:");
    expect(script).toContain("listen timeout");
    expect(script).toContain("PRISM_HOST_LISTEN_FILE");
    expect(script).not.toContain("0.0.0.0");
  });
});
