import { describe, expect, it } from "vitest";
import { parseOpencodeVersionOutput } from "../../src/shared/opencode-version";

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
