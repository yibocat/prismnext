import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hostPayloadFileName,
  resolveBundledHostPayload,
  sha256File,
} from "../../src/main/remote/payload-path";

describe("resolveBundledHostPayload", () => {
  it("returns payload_missing_local when extraResources are absent", () => {
    const empty = mkdtempSync(join(tmpdir(), "prism-host-missing-"));
    const result = resolveBundledHostPayload({
      packaged: true,
      resourcesPath: empty,
      arch: "arm64",
    });
    expect(result).toEqual({ error: "payload_missing_local" });
  });

  it("hashes a local tarball without downloading", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-host-payload-"));
    const hostDir = join(root, "host");
    mkdirSync(hostDir, { recursive: true });
    const file = join(hostDir, hostPayloadFileName("arm64"));
    writeFileSync(file, "fake-tarball");
    const result = resolveBundledHostPayload({
      packaged: true,
      resourcesPath: root,
      arch: "arm64",
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.sha256).toBe(sha256File(file));
    expect(result.path).toBe(file);
  });
});
