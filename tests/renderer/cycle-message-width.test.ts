// tests/renderer/cycle-message-width.test.ts
// Unit test for the cycleMessageWidth helper used by the
// "product.cycleMessageWidth" shortcut (Cmd/Ctrl+Shift+W).
//
// The helper is a pure function — three tiers, cycles forward, and tolerates
// any stale / missing value by snapping to "wide" next (the most useful land
// for users migrating from a deleted/renamed setting).

import { describe, expect, it } from "vitest";
import { cycleMessageWidth } from "@/hooks/use-product-shortcuts";

describe("cycleMessageWidth", () => {
  it("cycles forward through all three tiers", () => {
    expect(cycleMessageWidth("narrow")).toBe("balanced");
    expect(cycleMessageWidth("balanced")).toBe("wide");
    expect(cycleMessageWidth("wide")).toBe("narrow");
  });

  it("falls back to 'wide' for unknown / missing values", () => {
    // Unknown strings and undefined both snap to "wide" — the next press
    // after migration lands on a known tier instead of staying lost.
    expect(cycleMessageWidth(undefined)).toBe("wide");
    expect(cycleMessageWidth("")).toBe("wide");
    expect(cycleMessageWidth("gigantic")).toBe("wide");
  });

  it("two full cycles return to the starting tier", () => {
    const start: ReturnType<typeof cycleMessageWidth> = "narrow";
    const once = cycleMessageWidth(start);
    const twice = cycleMessageWidth(once);
    const thrice = cycleMessageWidth(twice);
    expect(thrice).toBe(start);
  });
});
