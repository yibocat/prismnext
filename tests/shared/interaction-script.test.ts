import { describe, expect, it } from "vitest";
import {
  SCRIPT_SAMPLE_JS,
  assertScriptHardBans,
  buildScriptSandboxHtml,
  classifyResourceEmbedKind,
  hasRenderExport,
  isInteractionScriptKind,
  scriptResourcePath,
  stripScriptComments,
} from "../../src/shared/interaction-script";

describe("isInteractionScriptKind", () => {
  it("matches figure.script, trims, case-sensitive", () => {
    expect(isInteractionScriptKind("figure.script")).toBe(true);
    expect(isInteractionScriptKind("  figure.script  ")).toBe(true);
    expect(isInteractionScriptKind("figure.plotly")).toBe(false);
    expect(isInteractionScriptKind("Figure.Script")).toBe(false);
  });
});

describe("scriptResourcePath", () => {
  it("finds the role:script entry, ignores others, null when absent", () => {
    expect(
      scriptResourcePath([
        { role: "data", path: "atoms.json" },
        { role: "script", path: "script.js" },
      ]),
    ).toBe("script.js");
    expect(scriptResourcePath([{ role: "data", path: "atoms.json" }])).toBeNull();
    expect(scriptResourcePath(undefined)).toBeNull();
    expect(scriptResourcePath([])).toBeNull();
  });
});

describe("stripScriptComments", () => {
  it("strips block and line comments", () => {
    const src = `const a = 1; // fetch(\n/* import x */ const b = 2;`;
    const stripped = stripScriptComments(src);
    expect(stripped).not.toContain("fetch(");
    expect(stripped).not.toContain("import x");
    expect(stripped).toContain("const a = 1;");
    expect(stripped).toContain("const b = 2;");
  });
});

describe("assertScriptHardBans", () => {
  const banned = [
    'import x from "y";',
    'require("fs");',
    "eval('1+1');",
    "new Function('return 1');",
    "document.cookie = 'x';",
    "window.parent.postMessage('x','*');",
    "window.top.location;",
    "fetch('https://x.com');",
    "new XMLHttpRequest();",
    "new WebSocket('wss://x');",
    "localStorage.getItem('x');",
    "indexedDB.open('x');",
  ];

  it.each(banned)("throws for banned construct: %s", (snippet) => {
    expect(() => assertScriptHardBans(`export function render(ctx) { ${snippet} }`)).toThrow();
  });

  it("does not throw for legitimate Plotly/DOM/math code", () => {
    const legit = `
export async function render(ctx) {
  const trace = { type: "scatter3d", x: [1, 2], y: [1, 2], z: [1, 2] };
  await ctx.Plotly.newPlot(ctx.el, [trace], {});
  const div = document.createElement("div");
  ctx.el.appendChild(div);
  const r = Math.sin(1) * Math.cos(2);
  return r;
}`;
    expect(() => assertScriptHardBans(legit)).not.toThrow();
  });

  it("ignores banned identifiers inside comments but still catches real code", () => {
    const ok = `// fetch('https://example.com') is just a comment\nexport function render(ctx) {}`;
    expect(() => assertScriptHardBans(ok)).not.toThrow();

    const bad = `// mentions fetch in a comment\nexport function render(ctx) { fetch('https://example.com'); }`;
    expect(() => assertScriptHardBans(bad)).toThrow();
  });
});

describe("hasRenderExport", () => {
  it("accepts export function/const/async variants", () => {
    expect(hasRenderExport("export function render(ctx) {}")).toBe(true);
    expect(hasRenderExport("export const render = (ctx) => {};")).toBe(true);
    expect(hasRenderExport("export async function render(ctx) {}")).toBe(true);
  });

  it("rejects missing export or wrong name, no alias fallback", () => {
    expect(hasRenderExport("function render(ctx) {}")).toBe(false);
    expect(hasRenderExport("export function setup(ctx) {}")).toBe(false);
    expect(hasRenderExport("export function mount(ctx) {}")).toBe(false);
  });
});

describe("classifyResourceEmbedKind", () => {
  it("classifies by extension", () => {
    expect(classifyResourceEmbedKind("a.png")).toBe("image");
    expect(classifyResourceEmbedKind("a.JPG")).toBe("image");
    expect(classifyResourceEmbedKind("a.svg")).toBe("image");
    expect(classifyResourceEmbedKind("a.json")).toBe("json");
    expect(classifyResourceEmbedKind("a.csv")).toBe("text");
    expect(classifyResourceEmbedKind("a")).toBe("text");
  });
});

describe("buildScriptSandboxHtml", () => {
  const baseInput = {
    plotlyJs: "/* PLOTLY_BUNDLE_MARKER */ window.Plotly = {};",
    scriptText: "export function render(ctx) { ctx.el.textContent = 'hi'; }",
    resources: [{ role: "data", json: { a: 1 } }],
    bindings: { R: 1.5 },
    size: { width: 480, height: 360 },
    theme: { isDark: false },
  };

  it("contains a module script and the plotly bundle text verbatim", () => {
    const html = buildScriptSandboxHtml(baseInput);
    expect(html).toContain('<script type="module">');
    expect(html).toContain("PLOTLY_BUNDLE_MARKER");
  });

  it("safely embeds script text containing a literal </script> substring", () => {
    const tricky = {
      ...baseInput,
      scriptText: "export function render(ctx) { const s = '</script>'; ctx.setStatus(s); }",
    };
    const html = buildScriptSandboxHtml(tricky);
    // The escaped form (\u003c/script>) must appear; a literal, unescaped
    // "</script>" from inside the embedded string must not prematurely close
    // the module script tag.
    expect(html).toContain("\\u003c/script>");
    const firstModuleOpen = html.indexOf('<script type="module">');
    const firstModuleClose = html.indexOf("</script>", firstModuleOpen);
    const bootstrapBody = html.slice(firstModuleOpen, firstModuleClose);
    expect(bootstrapBody).toContain("render");
  });

  it("includes THREE bootstrap only when threeModuleJs is provided", () => {
    const withThree = buildScriptSandboxHtml({ ...baseInput, threeModuleJs: "/* THREE_MARKER */" });
    expect(withThree).toContain("THREE_MARKER");
    expect(withThree).toContain("import(");

    const withoutThree = buildScriptSandboxHtml(baseInput);
    expect(withoutThree).not.toContain("THREE_MARKER");
  });

  it("embeds resources/bindings/size/theme as reachable JSON", () => {
    const html = buildScriptSandboxHtml(baseInput);
    expect(html).toContain(JSON.stringify(baseInput.bindings).replace(/</g, "\\u003c"));
    expect(html).toContain(JSON.stringify(baseInput.size).replace(/</g, "\\u003c"));
    expect(html).toContain(JSON.stringify(baseInput.theme).replace(/</g, "\\u003c"));
  });

  it("sets up both reporting channels (global flag + postMessage)", () => {
    const html = buildScriptSandboxHtml(baseInput);
    expect(html).toContain("__prismScript");
    expect(html).toContain("prism-script-ready");
    expect(html).toContain("prism-script-error");
  });

  it("injects the network-denying CSP", () => {
    const html = buildScriptSandboxHtml(baseInput);
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("connect-src 'none'");
  });
});
