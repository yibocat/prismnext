import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rewriteRemoteAbsKeys, remoteProfileFromArgs } from "../../src/main/remote/domain-route";

const compileIpc = readFileSync(join(__dirname, "../../src/main/ipc/compile.ts"), "utf8");

describe("remote compile routing", () => {
  it("rewrites projectDir and is wired in compile IPC", () => {
    expect(remoteProfileFromArgs({ projectDir: "remote://lab/home/u/paper" }, ["projectDir"])).toBe("lab");
    expect(rewriteRemoteAbsKeys({ projectDir: "remote://lab/home/u/paper", mainFile: "main.tex" }, ["projectDir"])).toEqual({
      projectDir: "/home/u/paper",
      mainFile: "main.tex",
    });
    expect(compileIpc).toContain("compile:execute");
    expect(compileIpc).toContain("pullRemoteBlob");
    expect(compileIpc).toContain("pdfOnDisk: true");
  });
});
