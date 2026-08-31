import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DESKTOP_ONLY_EXTRACT_METHODS,
  DESKTOP_ONLY_LITERATURE_METHODS,
  HOST_EXTRACT_METHODS,
  HOST_LITERATURE_METHODS,
  disconnectedLiteratureProbe,
  isHostExtractMethod,
  remoteProfileIdFromLiteratureArgs,
  rewriteLiteratureParamsForHost,
} from "../../src/main/remote/literature-route";

const ipc = readFileSync(join(__dirname, "../../src/main/ipc/literature.ts"), "utf8");
const extractIpc = readFileSync(join(__dirname, "../../src/main/ipc/literature-extract.ts"), "utf8");

describe("remote literature IPC routing", () => {
  it("lists every Host-bound method and wires it in ipc/literature.ts", () => {
    for (const method of HOST_LITERATURE_METHODS) {
      expect(ipc).toContain(`"${method}"`);
    }
    expect(ipc).toContain("routeIfRemote");
  });

  it("keeps file-picker dialogs on the desktop", () => {
    for (const method of DESKTOP_ONLY_LITERATURE_METHODS) {
      expect(HOST_LITERATURE_METHODS).not.toContain(method);
    }
  });

  it("resolves a remote profile from projectRoot and rewrites the path", () => {
    expect(remoteProfileIdFromLiteratureArgs({
      projectRoot: "remote://lab/home/ubuntu/paper",
    })).toBe("lab");
    expect(rewriteLiteratureParamsForHost({
      projectRoot: "remote://lab/home/ubuntu/paper",
      query: "attention",
    })).toEqual({
      projectRoot: "/home/ubuntu/paper",
      query: "attention",
    });
  });

  it("does not route a local folder", () => {
    expect(remoteProfileIdFromLiteratureArgs({ projectRoot: "/Users/me/paper" })).toBeNull();
  });

  it("returns quiet empty reads while SSH is down", () => {
    expect(disconnectedLiteratureProbe("literature:list")).toEqual({ hit: true, result: [] });
    expect(disconnectedLiteratureProbe("literature:listCollections")).toEqual({
      hit: true,
      result: [],
    });
    expect(disconnectedLiteratureProbe("literature:getPdfCacheStatus")).toEqual({
      hit: true,
      result: {},
    });
    expect(disconnectedLiteratureProbe("literature:createPaper")).toEqual({ hit: false });
  });

  it("lists every Host-bound extract method and wires it in ipc/literature-extract.ts", () => {
    for (const method of HOST_EXTRACT_METHODS) {
      expect(extractIpc).toContain(`"${method}"`);
      expect(isHostExtractMethod(method)).toBe(true);
    }
    expect(extractIpc).toContain("routeHostLiteratureMethod");
    expect(DESKTOP_ONLY_EXTRACT_METHODS).toEqual(["extract:testMineru"]);
    expect(HOST_EXTRACT_METHODS).not.toContain("extract:testMineru");
  });

  it("rewrites extract projectRoot for the Host and stays quiet while SSH is down", () => {
    expect(remoteProfileIdFromLiteratureArgs({
      projectRoot: "remote://lab/home/ubuntu/paper",
      paperId: "p1",
    })).toBe("lab");
    expect(rewriteLiteratureParamsForHost({
      projectRoot: "remote://lab/home/ubuntu/paper",
      paperId: "p1",
      source: "pdfjs",
    })).toEqual({
      projectRoot: "/home/ubuntu/paper",
      paperId: "p1",
      source: "pdfjs",
    });
    expect(disconnectedLiteratureProbe("extract:list")).toEqual({ hit: true, result: [] });
    expect(disconnectedLiteratureProbe("extract:resume")).toEqual({ hit: true, result: { ok: true } });
    expect(disconnectedLiteratureProbe("extract:enqueue")).toEqual({ hit: false });
  });
});
