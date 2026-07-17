import { describe, expect, it } from "vitest";
import {
  copyPdfSourceForViewer,
  pdfDataUrlToUint8Array,
} from "../../src/renderer/components/modules/preview/pdf-config";

describe("copyPdfSourceForViewer", () => {
  it("returns a detached-safe copy of Uint8Array bytes", () => {
    const original = new Uint8Array([1, 2, 3, 4]);
    const copy = copyPdfSourceForViewer(original);
    expect(copy).toBeInstanceOf(Uint8Array);
    expect(copy).not.toBe(original);
    expect(copy).toEqual(original);
    (copy as Uint8Array)[0] = 9;
    expect(original[0]).toBe(1);
  });

  it("passes string sources through unchanged", () => {
    const url = "data:application/pdf;base64,AAAA";
    expect(copyPdfSourceForViewer(url)).toBe(url);
  });
});

describe("pdfDataUrlToUint8Array", () => {
  it("decodes a data:application/pdf;base64 URL", () => {
    const dataUrl = "data:application/pdf;base64,JVBERg==";
    const bytes = pdfDataUrlToUint8Array(dataUrl);
    expect([...bytes]).toEqual([0x25, 0x50, 0x44, 0x46]);
  });
});
