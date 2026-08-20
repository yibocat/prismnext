import { describe, expect, it } from "vitest";
import {
  matchReservedBashOp,
  matchReservedGateOp,
  matchReservedOpRows,
  type ReservedOpRow,
} from "../../src/shared/reserved-ops";
import { TOOL_NAMES } from "../../src/shared/tool-names";

describe("matchReservedBashOp", () => {
  it("hits the three host-owned verbs", () => {
    const tex = matchReservedBashOp("pdflatex main.tex");
    expect(tex?.id).toBe("latex_compile");
    expect(tex?.hostTool).toBe(TOOL_NAMES.latexCompile);
    expect(tex?.message).toContain("latex-compile");

    const rm = matchReservedBashOp("rm figures/old.png");
    expect(rm?.id).toBe("file_delete");
    expect(rm?.hostTool).toBe(TOOL_NAMES.delete);
    expect(rm?.message).toContain("delete");

    const raster = matchReservedBashOp(
      `python3 -c "from PIL import Image; Image.open('a.png').resize((400,400)).save('a.jpg')"`,
    );
    expect(raster?.id).toBe("present_substitute");
    expect(raster?.hostTool).toBeNull();
    expect(raster?.message).toMatch(/preview/i);
  });

  it("does not treat recursive rm as file_delete", () => {
    expect(matchReservedBashOp("rm -rf build")).toBeNull();
    expect(matchReservedBashOp("rm -r out/")).toBeNull();
  });

  it("gate applies file_delete / present_substitute only to bash", () => {
    expect(matchReservedGateOp("rm figures/old.png", "bash")?.id).toBe("file_delete");
    expect(matchReservedGateOp("rm figures/old.png", "experiment-run")).toBeNull();
    expect(matchReservedGateOp("pdflatex main.tex", "experiment-run")?.id).toBe("latex_compile");
  });

  it("adds a fourth row without changing the matcher signature", () => {
    const extra: ReservedOpRow = {
      id: "file_delete",
      hostTool: TOOL_NAMES.move,
      match: (command) => /\bmv\s+\S+/.test(command),
      message: () => "use move",
    };
    const hit = matchReservedOpRows("mv a.tex b.tex", [extra]);
    expect(hit?.message).toBe("use move");
    expect(hit?.hostTool).toBe(TOOL_NAMES.move);
  });
});
