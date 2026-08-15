import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOpencodeVersionOutput } from "../../src/shared/opencode-version";
import {
  assertOpencodeBinarySpawnable,
  classifyOpencodeBinaryHeader,
  opencodeBinarySpawnError,
} from "../../src/main/services/opencode-binary";

describe("parseOpencodeVersionOutput", () => {
  it("parses plain semver", () => {
    expect(parseOpencodeVersionOutput("1.17.7\n")).toBe("1.17.7");
  });

  it("strips leading v", () => {
    expect(parseOpencodeVersionOutput("v1.2.3")).toBe("1.2.3");
  });

  it("uses the first line only", () => {
    expect(parseOpencodeVersionOutput("1.17.7\nextra noise")).toBe("1.17.7");
  });

  it("returns null for empty output", () => {
    expect(parseOpencodeVersionOutput("")).toBeNull();
    expect(parseOpencodeVersionOutput("   \n")).toBeNull();
  });
});

describe("classifyOpencodeBinaryHeader", () => {
  it("detects a zip archive (the Windows packaging failure mode)", () => {
    expect(classifyOpencodeBinaryHeader(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe("zip");
  });

  it("detects a Windows PE executable", () => {
    expect(classifyOpencodeBinaryHeader(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBe("pe");
  });

  it("detects an ELF binary", () => {
    expect(classifyOpencodeBinaryHeader(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]))).toBe("elf");
  });

  it("returns unknown for empty or unrelated bytes", () => {
    expect(classifyOpencodeBinaryHeader(new Uint8Array())).toBe("unknown");
    expect(classifyOpencodeBinaryHeader(new Uint8Array([0x00, 0x01]))).toBe("unknown");
  });
});

describe("opencodeBinarySpawnError", () => {
  it("rejects a zip on Windows — that is spawn UNKNOWN", () => {
    const err = opencodeBinarySpawnError("zip", "win32");
    expect(err).toMatch(/zip/i);
    expect(err).toMatch(/Windows|executable|spawn/i);
  });

  it("rejects a non-PE file on Windows", () => {
    expect(opencodeBinarySpawnError("elf", "win32")).toMatch(/Windows|PE|executable/i);
    expect(opencodeBinarySpawnError("unknown", "win32")).toMatch(/Windows|PE|executable/i);
  });

  it("accepts a PE file on Windows", () => {
    expect(opencodeBinarySpawnError("pe", "win32")).toBeNull();
  });

  it("rejects a zip on every platform", () => {
    expect(opencodeBinarySpawnError("zip", "darwin")).toMatch(/zip/i);
    expect(opencodeBinarySpawnError("zip", "linux")).toMatch(/zip/i);
  });

  it("accepts native unix binaries", () => {
    expect(opencodeBinarySpawnError("macho", "darwin")).toBeNull();
    expect(opencodeBinarySpawnError("elf", "linux")).toBeNull();
  });

  it("throws when the on-disk file is a zip named like an exe", () => {
    const dir = mkdtempSync(join(tmpdir(), "opencode-bin-"));
    const fake = join(dir, "opencode.exe");
    writeFileSync(fake, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]));
    expect(() => assertOpencodeBinarySpawnable(fake, "win32")).toThrow(/zip/i);
  });
});
