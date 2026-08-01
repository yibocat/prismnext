import { describe, expect, it } from "vitest";
import { resolveChatHomeBackdrop } from "@/lib/chat/home-backdrops/resolve";

describe("resolveChatHomeBackdrop", () => {
  it("returns null when disabled", () => {
    expect(resolveChatHomeBackdrop("academic", false, "academic")).toBeNull();
  });

  it("follows theme pack defaults in auto mode", () => {
    expect(resolveChatHomeBackdrop("auto", true, "academic")).toBe("academic");
    expect(resolveChatHomeBackdrop("auto", true, "warm-paper")).toBe("origami");
    expect(resolveChatHomeBackdrop("auto", true, "midnight")).toBe("rain");
    expect(resolveChatHomeBackdrop("auto", true, "forest")).toBe("forest");
    expect(resolveChatHomeBackdrop("auto", true, "graphite")).toBe("blueprint");
  });

  it("maps legacy none to theme default", () => {
    expect(resolveChatHomeBackdrop("none", true, "academic")).toBe("academic");
  });

  it("allows manual override across theme packs", () => {
    expect(resolveChatHomeBackdrop("rain", true, "graphite")).toBe("rain");
    expect(resolveChatHomeBackdrop("origami", true, "academic")).toBe("origami");
  });

  it("defaults to auto when setting is undefined", () => {
    expect(resolveChatHomeBackdrop(undefined, undefined, "midnight")).toBe("rain");
  });
});
