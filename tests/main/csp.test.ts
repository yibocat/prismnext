import { describe, it, expect } from "vitest";
import { buildCsp } from "../../src/main/lib/csp";

describe("csp buildCsp", () => {
  it("prod policy locks script-src to 'self' + wasm-unsafe-eval (Shiki), no full unsafe-eval", () => {
    const csp = buildCsp(true);
    const scriptSrc = csp.match(/script-src ([^;]+);/)?.[1] ?? "";
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'wasm-unsafe-eval'");
    expect(scriptSrc.split(/\s+/)).not.toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("prod policy blocks plugins, framing, form submission off-origin", () => {
    const csp = buildCsp(true);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("prod policy allows the literature-pdf protocol + images + workers", () => {
    const csp = buildCsp(true);
    expect(csp).toContain("literature-pdf:");
    expect(csp).toContain("img-src 'self' data: blob: literature-pdf: http: https:");
    expect(csp).toContain("worker-src 'self' blob:");
    // styles need unsafe-inline (Tailwind + runtime CSS injection)
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("prod policy does NOT allow dev-only ws/localhost connect", () => {
    const csp = buildCsp(true);
    expect(csp).not.toContain("ws://localhost");
    expect(csp).not.toContain("http://localhost:*");
  });

  it("dev policy allows eval/inline script + ws localhost for Vite HMR", () => {
    const csp = buildCsp(false);
    const scriptSrc = csp.match(/script-src ([^;]+);/)?.[1] ?? "";
    expect(scriptSrc).toContain("unsafe-eval");
    expect(scriptSrc).toContain("unsafe-inline");
    expect(csp).toContain("ws://localhost:*");
    expect(csp).toContain("http://localhost:*");
  });

  it("both policies block object-src and lock base-uri", () => {
    expect(buildCsp(true)).toContain("object-src 'none'");
    expect(buildCsp(false)).toContain("object-src 'none'");
    expect(buildCsp(true)).toContain("base-uri 'self'");
    expect(buildCsp(false)).toContain("base-uri 'self'");
  });
});
