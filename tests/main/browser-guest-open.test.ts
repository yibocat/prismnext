import { describe, expect, it } from "vitest";
import { isBrowserGuestOpenUrl } from "../../src/main/ipc/browser";

describe("isBrowserGuestOpenUrl", () => {
  it("accepts http(s) and file URLs", () => {
    expect(isBrowserGuestOpenUrl("https://arxiv.org/abs/1234")).toBe(true);
    expect(isBrowserGuestOpenUrl("http://127.0.0.1:5180/")).toBe(true);
    expect(isBrowserGuestOpenUrl("file:///tmp/report.html")).toBe(true);
  });

  it("rejects scripts and empty targets", () => {
    expect(isBrowserGuestOpenUrl("javascript:alert(1)")).toBe(false);
    expect(isBrowserGuestOpenUrl("about:blank")).toBe(false);
    expect(isBrowserGuestOpenUrl("")).toBe(false);
  });
});
