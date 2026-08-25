import { describe, expect, it } from "vitest";
import { cycleChatBackdrop } from "@/lib/chat/home-backdrops/resolve";
import { cycleThemePack } from "@/lib/theme/theme-packs";

describe("cycleThemePack", () => {
  it("cycles forward through all packs", () => {
    expect(cycleThemePack("academic")).toBe("midnight");
    expect(cycleThemePack("midnight")).toBe("forest");
    expect(cycleThemePack("forest")).toBe("warm-paper");
    expect(cycleThemePack("warm-paper")).toBe("graphite");
    expect(cycleThemePack("graphite")).toBe("academic");
  });

  it("falls back to midnight for unknown ids", () => {
    expect(cycleThemePack(undefined)).toBe("midnight");
    expect(cycleThemePack("unknown")).toBe("midnight");
  });
});

describe("cycleChatBackdrop", () => {
  it("cycles explicit styles", () => {
    expect(cycleChatBackdrop("academic", true, "graphite")).toBe("origami");
    expect(cycleChatBackdrop("stamp", true, "academic")).toBe("pendulum");
    expect(cycleChatBackdrop("constellation", true, "academic")).toBe("academic");
  });

  it("resolves auto from theme pack before cycling", () => {
    expect(cycleChatBackdrop("auto", true, "midnight")).toBe("stamp");
    expect(cycleChatBackdrop("auto", true, "graphite")).toBe("stamp");
  });

  it("treats disabled as theme default when cycling", () => {
    expect(cycleChatBackdrop("auto", false, "forest")).toBe("stamp");
  });
});
