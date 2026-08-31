import { describe, expect, it } from "vitest";
import {
  parseTypstPreviewLoopbackPort,
  planTypstPreviewForwards,
  rewriteTypstPreviewUrl,
} from "../../src/shared/typst/preview-tunnel";

describe("planTypstPreviewForwards", () => {
  it("forwards only the static port when data-plane shares it", () => {
    expect(planTypstPreviewForwards({
      previewUrl: "http://127.0.0.1:56299/",
      staticServerPort: 56299,
      dataPlanePort: 56299,
    })).toEqual({ staticRemotePort: 56299, sameNumberRemotePorts: [] });
  });

  it("reads the port from the URL when staticServerPort is omitted", () => {
    expect(planTypstPreviewForwards({
      previewUrl: "http://127.0.0.1:23625/",
    })).toEqual({ staticRemotePort: 23625, sameNumberRemotePorts: [] });
  });

  it("requires a same-number local bind when data-plane differs", () => {
    expect(planTypstPreviewForwards({
      previewUrl: "http://127.0.0.1:4000/",
      staticServerPort: 4000,
      dataPlanePort: 4001,
    })).toEqual({ staticRemotePort: 4000, sameNumberRemotePorts: [4001] });
  });

  it("rejects a non-loopback preview URL", () => {
    expect(() => planTypstPreviewForwards({
      previewUrl: "http://203.0.113.8:56299/",
    })).toThrow(/loopback port/);
  });
});

describe("rewriteTypstPreviewUrl", () => {
  it("rewrites only the loopback port", () => {
    expect(rewriteTypstPreviewUrl("http://127.0.0.1:56299/", 56299, 49152))
      .toBe("http://127.0.0.1:49152/");
  });

  it("is a no-op when local and remote ports match", () => {
    expect(rewriteTypstPreviewUrl("http://127.0.0.1:56299/", 56299, 56299))
      .toBe("http://127.0.0.1:56299/");
  });

  it("normalizes localhost to 127.0.0.1 on rewrite", () => {
    expect(rewriteTypstPreviewUrl("http://localhost:56299/", 56299, 9))
      .toBe("http://127.0.0.1:9/");
  });

  it("refuses to rewrite a public host", () => {
    expect(() => rewriteTypstPreviewUrl("http://203.0.113.8:56299/", 56299, 1))
      .toThrow(/loopback/);
  });
});

describe("parseTypstPreviewLoopbackPort", () => {
  it("reads 127.0.0.1", () => {
    expect(parseTypstPreviewLoopbackPort("http://127.0.0.1:56299/")).toBe(56299);
  });

  it("rejects a LAN address", () => {
    expect(parseTypstPreviewLoopbackPort("http://10.0.0.8:56299/")).toBeNull();
  });
});
