/**
 * figure-observable-plot render lane — end-to-end: spec.mjs + CSV → SVG via
 * the app's own node_modules (PRISM_APP_NODE_MODULES) and plain Node.
 */
import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RENDER_SCRIPT = join(
  process.cwd(),
  "resources",
  "teams",
  "prismnext.core",
  "skills",
  "figure-observable-plot",
  "scripts",
  "render_plot.mjs",
);

const APP_NODE_MODULES = join(process.cwd(), "node_modules");

describe("figure-observable-plot render_plot.mjs", () => {
  it("ships jsdom as a production dependency (asar packaging)", () => {
    // electron-builder only packs `dependencies` into app.asar. jsdom lived in
    // devDependencies once and broke PRISM_APP_NODE_MODULES resolution in
    // distributed builds while @observablehq/plot still resolved.
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf-8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@observablehq/plot"]).toBeTruthy();
    expect(pkg.dependencies?.jsdom).toBeTruthy();
    expect(pkg.devDependencies?.jsdom).toBeUndefined();
  });

  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function setup(): { spec: string; csv: string; out: string } {
    root = mkdtempSync(join(tmpdir(), "prism-oplot-"));
    const spec = join(root, "spec.mjs");
    const csv = join(root, "data.csv");
    const out = join(root, "fig.svg");
    writeFileSync(
      spec,
      `export default ({ Plot, rows }) => ({
        width: 480,
        height: 300,
        marks: [
          Plot.rectY(rows, Plot.binX({ y: "count" }, { x: "v" })),
          Plot.ruleY([0]),
        ],
      });\n`,
      "utf-8",
    );
    writeFileSync(csv, "v\n1.2\n0.8\n2.1\n1.7\n0.3\n1.9\n", "utf-8");
    return { spec, csv, out };
  }

  it("renders a spec + CSV to SVG using the app node_modules", () => {
    const { spec, csv, out } = setup();
    const stdout = execFileSync(
      process.execPath,
      [RENDER_SCRIPT, spec, "--data", csv, "--out", out],
      {
        env: { ...process.env, PRISM_APP_NODE_MODULES: APP_NODE_MODULES },
        encoding: "utf-8",
      },
    );
    expect(stdout).toMatch(/wrote .*fig\.svg/);
    expect(existsSync(out)).toBe(true);
    const svg = readFileSync(out, "utf-8");
    expect(svg).toContain("<svg");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("<rect"); // the binned bars
  });

  it("renders without --data (inline data in spec)", () => {
    root = mkdtempSync(join(tmpdir(), "prism-oplot-"));
    const spec = join(root, "spec.mjs");
    const out = join(root, "fig.svg");
    writeFileSync(
      spec,
      `export default ({ Plot }) => ({
        marks: [Plot.lineY([1, 3, 2, 5])],
      });\n`,
      "utf-8",
    );
    execFileSync(process.execPath, [RENDER_SCRIPT, spec, "--out", out], {
      env: { ...process.env, PRISM_APP_NODE_MODULES: APP_NODE_MODULES },
      encoding: "utf-8",
    });
    expect(readFileSync(out, "utf-8")).toContain("<svg");
  });

  it("fails cleanly when the spec has no default export", () => {
    const { csv, out } = setup();
    const badSpec = join(root, "bad.mjs");
    writeFileSync(badSpec, `export const notDefault = 1;\n`, "utf-8");
    let code = 0;
    let stderr = "";
    try {
      execFileSync(process.execPath, [RENDER_SCRIPT, badSpec, "--data", csv, "--out", out], {
        env: { ...process.env, PRISM_APP_NODE_MODULES: APP_NODE_MODULES },
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      code = (err as { status?: number }).status ?? 1;
      stderr = String((err as { stderr?: unknown }).stderr ?? "");
    }
    expect(code).toBe(1);
    expect(stderr).toMatch(/export default/);
  });

  it("fails with guidance when deps cannot be resolved", () => {
    root = mkdtempSync(join(tmpdir(), "prism-oplot-nodeps-"));
    const spec = join(root, "spec.mjs");
    const out = join(root, "fig.svg");
    writeFileSync(spec, `export default () => ({});\n`, "utf-8");
    let code = 0;
    let stderr = "";
    try {
      execFileSync(process.execPath, [RENDER_SCRIPT, spec, "--out", out], {
        // Point at a void and neutralize any upward node_modules hit by
        // running from a bare temp dir.
        env: { ...process.env, PRISM_APP_NODE_MODULES: join(root, "void") },
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        cwd: root,
      });
    } catch (err) {
      code = (err as { status?: number }).status ?? 1;
      stderr = String((err as { stderr?: unknown }).stderr ?? "");
    }
    expect(code).toBe(1);
    expect(stderr).toMatch(/cannot resolve @observablehq\/plot/);
  });

  it("names the packaging hole when plot resolves but jsdom does not", () => {
    root = mkdtempSync(join(tmpdir(), "prism-oplot-nojsdom-"));
    // Must be named `node_modules` — createRequire only resolves siblings under
    // a directory literally called node_modules (Node skips doubling that segment).
    const nm = join(root, "node_modules");
    mkdirSync(join(nm, "@observablehq", "plot"), { recursive: true });
    // Minimal stub so createRequire can load plot but not jsdom.
    writeFileSync(
      join(nm, "@observablehq", "plot", "package.json"),
      JSON.stringify({ name: "@observablehq/plot", main: "index.js" }),
    );
    writeFileSync(join(nm, "@observablehq", "plot", "index.js"), "module.exports = {};\n");
    const spec = join(root, "spec.mjs");
    const out = join(root, "fig.svg");
    writeFileSync(spec, `export default () => ({});\n`, "utf-8");
    let code = 0;
    let stderr = "";
    try {
      execFileSync(process.execPath, [RENDER_SCRIPT, spec, "--out", out], {
        env: { ...process.env, PRISM_APP_NODE_MODULES: nm },
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        cwd: root,
      });
    } catch (err) {
      code = (err as { status?: number }).status ?? 1;
      stderr = String((err as { stderr?: unknown }).stderr ?? "");
    }
    expect(code).toBe(1);
    expect(stderr).toMatch(/jsdom is missing/);
    expect(stderr).toMatch(/packaging/);
  });
});
