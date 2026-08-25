import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkStoredHostKey,
  decideHostKey,
  formatKnownHosts,
  parseKnownHosts,
  trustHostKey,
} from "../../src/main/remote/known-hosts";

describe("known_hosts", () => {
  it("rejects an unknown host in strict mode", () => {
    expect(decideHostKey(undefined, "SHA256:abc", true)).toBe("unknown");
    expect(decideHostKey(undefined, "SHA256:abc", false)).toBe("accept");
    expect(decideHostKey("SHA256:abc", "SHA256:abc", true)).toBe("accept");
    expect(decideHostKey("SHA256:old", "SHA256:new", true)).toBe("mismatch");
  });

  it("round-trips the product known_hosts file", () => {
    const text = formatKnownHosts(parseKnownHosts("lab.example.com 22 SHA256:abcd\n"));
    expect(text).toContain("lab.example.com 22 SHA256:abcd");
  });

  it("trust writes only the PrismNext side file", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-known-hosts-"));
    const file = join(dir, "known_hosts");
    expect(checkStoredHostKey("lab", 22, "SHA256:ff", true, file)).toBe("unknown");
    trustHostKey("lab", 22, "SHA256:ff", file);
    expect(checkStoredHostKey("lab", 22, "SHA256:ff", true, file)).toBe("accept");
    expect(readFileSync(file, "utf8")).toContain("PrismNext");
  });
});
