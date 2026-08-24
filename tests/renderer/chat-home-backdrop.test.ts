import { describe, expect, it } from "vitest";
import { resolveChatHomeBackdrop } from "@/lib/chat/home-backdrops/resolve";

describe("resolveChatHomeBackdrop", () => {
  it("returns null when disabled", () => {
    expect(resolveChatHomeBackdrop("academic", false, "academic")).toBeNull();
  });

  it("uses paperplane for auto and every theme pack", () => {
    expect(resolveChatHomeBackdrop("auto", true, "academic")).toBe("paperplane");
    expect(resolveChatHomeBackdrop("auto", true, "warm-paper")).toBe("paperplane");
    expect(resolveChatHomeBackdrop("auto", true, "midnight")).toBe("paperplane");
    expect(resolveChatHomeBackdrop("auto", true, "forest")).toBe("paperplane");
    expect(resolveChatHomeBackdrop("auto", true, "graphite")).toBe("paperplane");
  });

  it("maps legacy none to the paperplane default", () => {
    expect(resolveChatHomeBackdrop("none", true, "academic")).toBe("paperplane");
  });

  it("allows manual override across theme packs", () => {
    expect(resolveChatHomeBackdrop("rain", true, "graphite")).toBe("rain");
    expect(resolveChatHomeBackdrop("origami", true, "academic")).toBe("origami");
  });

  it("defaults to paperplane when setting is undefined", () => {
    expect(resolveChatHomeBackdrop(undefined, undefined, "midnight")).toBe("paperplane");
  });
});
