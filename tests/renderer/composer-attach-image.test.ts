import { describe, it, expect } from "vitest";
import {
  promptImageFromDataUrl,
  isVisionImagePath,
} from "../../src/renderer/lib/chat/composer-attach-file";

describe("composer attach image → ACP payload", () => {
  it("isVisionImagePath accepts common raster formats", () => {
    expect(isVisionImagePath("/tmp/photo.PNG")).toBe(true);
    expect(isVisionImagePath("/tmp/diagram.svg")).toBe(false);
  });

  it("promptImageFromDataUrl parses PNG data URL", () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    const img = promptImageFromDataUrl(dataUrl, "shot.png", "/Users/me/shot.png");
    expect(img).not.toBeNull();
    expect(img!.mimeType).toBe("image/png");
    expect(img!.data).toBe("iVBORw0KGgo=");
    expect(img!.uri).toBe("file:///Users/me/shot.png");
  });

  it("promptImageFromDataUrl rejects non-vision MIME", () => {
    const dataUrl = "data:image/svg+xml;base64,PHN2Zy8+";
    expect(promptImageFromDataUrl(dataUrl, "icon.svg")).toBeNull();
  });
});
