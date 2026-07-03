import { describe, expect, it } from "vitest";
import {
  httpFetchError,
  parseSha256Digest,
  sha256Hex,
  verifySha256Digest,
} from "../../src/main/services/skill-install-digest";

describe("skill-install-digest", () => {
  it("parses sha256 digest prefix", () => {
    const hex = "a".repeat(64);
    expect(parseSha256Digest(`sha256:${hex}`)).toBe(hex);
    expect(parseSha256Digest("sha256:short")).toBeNull();
    expect(parseSha256Digest(undefined)).toBeNull();
  });

  it("verifies matching digest", () => {
    const content = "# Skill\n";
    const digest = `sha256:${sha256Hex(content)}`;
    expect(() => verifySha256Digest(content, digest)).not.toThrow();
  });

  it("throws on digest mismatch", () => {
    expect(() => verifySha256Digest("hello", "sha256:" + "b".repeat(64))).toThrow(/digest mismatch/i);
  });

  it("maps HTTP errors to friendly messages", () => {
    expect(httpFetchError("https://example.com/x", 404, "GitHub download").message).toMatch(/not found/i);
    expect(httpFetchError("https://example.com/x", 403, "GitHub download").message).toMatch(/access denied/i);
    expect(httpFetchError("https://example.com/x", 429, "GitHub download").message).toMatch(/rate limited/i);
  });
});
