import { describe, expect, it } from "vitest";
import {
  isDisplayRasterBashCommand,
  displayRasterBashBlockMessage,
} from "../../src/shared/permissions/display-raster-bash";

describe("isDisplayRasterBashCommand", () => {
  it("blocks PIL resize/save one-liners", () => {
    expect(
      isDisplayRasterBashCommand(
        `python3 -c "from PIL import Image; Image.open('a.png').resize((400,400)).save('a.jpg')"`,
      ),
    ).toBe(true);
  });

  it("blocks ImageMagick / sips shrink", () => {
    expect(isDisplayRasterBashCommand("convert cell.pdf cell.png")).toBe(true);
    expect(isDisplayRasterBashCommand("magick cell.pdf -resize 400 cell.png")).toBe(true);
    expect(isDisplayRasterBashCommand("sips -Z 400 cell.png")).toBe(true);
  });

  it("blocks pdf-to-raster conversion used only to look at a figure", () => {
    expect(isDisplayRasterBashCommand("sips -s format png figures/a.pdf --out figures/a.png")).toBe(true);
    expect(isDisplayRasterBashCommand("pdftoppm -png figures/a.pdf figures/a")).toBe(true);
    expect(isDisplayRasterBashCommand("gs -sDEVICE=png16m -o a.png a.pdf")).toBe(true);
    expect(isDisplayRasterBashCommand("gs -v")).toBe(false);
  });

  it("does not block ordinary python or convert mentions", () => {
    expect(isDisplayRasterBashCommand("python3 train.py --epochs 2")).toBe(false);
    expect(isDisplayRasterBashCommand("echo convert cell.pdf")).toBe(false);
    expect(isDisplayRasterBashCommand("which magick")).toBe(false);
  });

  it("explains that chat already peeks", () => {
    expect(displayRasterBashBlockMessage()).toMatch(/preview/i);
  });
});
