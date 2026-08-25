import { describe, expect, it } from "vitest";
import {
  resolveSessionIcon,
  sessionIconFromPickerSpec,
} from "../../src/renderer/lib/chat/session-icon-registry";

describe("session-icon-registry", () => {
  it("resolves a lucide icon and ignores unknown names", () => {
    const resolved = resolveSessionIcon({ kind: "lucide", value: "BookOpen" });
    expect(resolved?.kind).toBe("lucide");
    expect(resolved && "value" in resolved ? resolved.value : null).toBe("BookOpen");
    expect(resolved && resolved.kind === "lucide" ? resolved.Icon : null).toBeTruthy();
    expect(resolveSessionIcon({ kind: "lucide", value: "NotARealIcon" })).toBeNull();
    expect(resolveSessionIcon({ kind: "lucide", value: "" })).toBeNull();
    expect(resolveSessionIcon(null)).toBeNull();
  });

  it("still reads the Phase 4 { name } shape", () => {
    const resolved = resolveSessionIcon({ name: "BookOpen", color: "primary" });
    expect(resolved).toMatchObject({ kind: "lucide", value: "BookOpen", color: "primary" });
  });

  it("resolves emoji without applying color", () => {
    const resolved = resolveSessionIcon({ kind: "emoji", value: "🧪", color: "warning" });
    expect(resolved).toEqual({ kind: "emoji", value: "🧪" });
  });

  it("keeps extra lucide tints such as sky", () => {
    const resolved = resolveSessionIcon({ kind: "lucide", value: "BookOpen", color: "sky" });
    expect(resolved && resolved.kind === "lucide" ? resolved.color : null).toBe("sky");
  });

  it("persists the picker spec color without falling back to a draft tint", () => {
    expect(sessionIconFromPickerSpec({ kind: "lucide", value: "FlaskConical", color: "sky" })).toEqual({
      kind: "lucide",
      value: "FlaskConical",
      color: "sky",
    });
    expect(sessionIconFromPickerSpec({ kind: "lucide", value: "FlaskConical" })).toEqual({
      kind: "lucide",
      value: "FlaskConical",
    });
    expect(sessionIconFromPickerSpec({ kind: "emoji", value: "🧪" })).toEqual({
      kind: "emoji",
      value: "🧪",
    });
    expect(sessionIconFromPickerSpec(null)).toBeNull();
  });

  it("falls back to default when the stored color is invalid", () => {
    const resolved = resolveSessionIcon({
      kind: "lucide",
      value: "BookOpen",
      color: "rainbow" as "primary",
    });
    expect(resolved?.kind).toBe("lucide");
    expect(resolved && resolved.kind === "lucide" ? resolved.color : null).toBe("default");
  });
});
