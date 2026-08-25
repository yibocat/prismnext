import { describe, expect, it } from "vitest";
import { parseKeyedFenceBody } from "../../src/shared/chat/fence-parse";

describe("parseKeyedFenceBody", () => {
  it("parses path fences", () => {
    expect(
      parseKeyedFenceBody("path: out/a.png\ntitle: Figure\n", "path"),
    ).toEqual({ primary: "out/a.png", title: "Figure" });
  });

  it("parses id fences", () => {
    expect(parseKeyedFenceBody("plot.loss\n", "id")).toEqual({
      primary: "plot.loss",
      title: undefined,
    });
  });

  it("rejects empty and parent traversal", () => {
    expect(parseKeyedFenceBody("", "path")).toBeNull();
    expect(parseKeyedFenceBody("path: ../x\n", "path")).toBeNull();
  });
});
