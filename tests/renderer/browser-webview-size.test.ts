import { describe, expect, it } from "vitest";
import {
  BROWSER_WEBVIEW_CLASS,
  syncWebviewGuestSize,
} from "@/modes/browser-mode/browser-view";

describe("Browser webview sizing", () => {
  it("keeps Electron's flex display contract", () => {
    expect(BROWSER_WEBVIEW_CLASS.split(/\s+/)).toContain("flex");
    expect(BROWSER_WEBVIEW_CLASS.split(/\s+/)).not.toContain("block");
  });

  it("uses stable content bounds but ignores transient small measurements", () => {
    const webview = { style: { width: "", height: "" } };

    expect(syncWebviewGuestSize(webview, { width: 640.4, height: 480.6 })).toBe(true);
    expect(webview.style).toEqual({ width: "640px", height: "481px" });

    expect(syncWebviewGuestSize(webview, { width: 90, height: 520 })).toBe(false);
    expect(webview.style).toEqual({ width: "640px", height: "481px" });
  });
});
