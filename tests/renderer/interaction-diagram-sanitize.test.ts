import { describe, expect, it } from "vitest";
import { sanitizeDiagramSvg } from "../../src/renderer/lib/interaction/diagram/sanitize-svg";

describe("sanitizeDiagramSvg", () => {
  it("strips <script> blocks", () => {
    const svg = `<svg><script>alert('x')</script><rect/></svg>`;
    const out = sanitizeDiagramSvg(svg);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(");
    expect(out).toContain("<rect/>");
  });

  it("strips inline event handler attributes", () => {
    const svg = `<svg><a onclick="evil()" href="https://x.com"><rect/></a></svg>`;
    const out = sanitizeDiagramSvg(svg);
    expect(out).not.toMatch(/onclick/i);
    expect(out).toContain('href="https://x.com"');
  });

  it("strips single-quoted inline event handler attributes", () => {
    const svg = `<svg><a onmouseover='evil()' href='https://x.com'><rect/></a></svg>`;
    const out = sanitizeDiagramSvg(svg);
    expect(out).not.toMatch(/onmouseover/i);
  });

  it("neutralizes javascript: hrefs", () => {
    const svg = `<svg><a href="javascript:alert(1)"><rect/></a></svg>`;
    const out = sanitizeDiagramSvg(svg);
    expect(out).not.toContain("javascript:");
    expect(out).toContain('href="#"');
  });

  it("leaves normal attributes untouched", () => {
    const svg = `<svg><rect fill="red" stroke="black" class="node"/></svg>`;
    const out = sanitizeDiagramSvg(svg);
    expect(out).toBe(svg);
  });
});
