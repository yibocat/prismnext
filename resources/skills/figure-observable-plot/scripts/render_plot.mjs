#!/usr/bin/env node
/**
 * render_plot.mjs — render an Observable Plot spec to SVG, headless.
 *
 * Usage:
 *   "$PRISM_NODE" render_plot.mjs spec.mjs --data data.csv --out figure.svg
 *
 * ($PRISM_NODE + ELECTRON_RUN_AS_NODE=1 are injected by experiment-run, so no
 * system Node install is required. Any recent `node` binary works too.)
 *
 * Spec contract (spec.mjs):
 *   export default ({ Plot, rows, columns, d3 }) => ({
 *     marks: [Plot.lineY(rows, { x: "t", y: "loss" })],
 *     // any Plot.plot() options — width/height/color/…
 *   });
 * The spec returns an OPTIONS OBJECT (not an element); this script injects
 * the JSDOM document and serializes the resulting SVG. `d3` may be null —
 * prefer plain JS over d3 helpers in specs, or install d3 in the project.
 *
 * Dependency resolution order for @observablehq/plot + jsdom:
 *   1. $PRISM_APP_NODE_MODULES (the PrismNext app's own node_modules)
 *   2. node_modules folders walking up from the spec's directory
 * If neither works, the error says how to install locally.
 */

import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function fail(message) {
  console.error(`render_plot: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--data" || a === "--out") {
      flags[a.slice(2)] = argv[++i];
    } else if (a?.startsWith("--")) {
      fail(`unknown flag ${a}`);
    } else if (a) {
      positional.push(a);
    }
  }
  if (positional.length !== 1) {
    fail("usage: render_plot.mjs <spec.mjs> [--data data.csv] --out figure.svg");
  }
  if (!flags.out) fail("missing --out <figure.svg>");
  return { specPath: resolve(positional[0]), dataPath: flags.data ? resolve(flags.data) : null, outPath: resolve(flags.out) };
}

function resolveDeps(fromDir) {
  const candidates = [];
  if (process.env.PRISM_APP_NODE_MODULES) candidates.push(process.env.PRISM_APP_NODE_MODULES);
  let dir = fromDir;
  for (let i = 0; i < 8; i++) {
    candidates.push(join(dir, "node_modules"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const nm of candidates) {
    if (!nm || !existsSync(join(nm, "@observablehq", "plot"))) continue;
    try {
      const req = createRequire(join(nm, "render-plot-probe.cjs"));
      const Plot = req("@observablehq/plot");
      let jsdom = null;
      let d3 = null;
      try { jsdom = req("jsdom"); } catch { /* handled below */ }
      try { d3 = req("d3"); } catch { d3 = null; }
      if (!jsdom) continue;
      return { Plot, JSDOM: jsdom.JSDOM, d3, resolvedFrom: nm };
    } catch {
      continue;
    }
  }
  return null;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };
  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { out.push(cur.trim().replace(/^"|"$/g, "")); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur.trim().replace(/^"|"$/g, ""));
    return out;
  };
  const columns = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    if (cells.length === 0) continue;
    const row = {};
    for (let c = 0; c < columns.length; c++) {
      const raw = cells[c] ?? "";
      const n = Number(raw);
      row[columns[c]] = raw !== "" && Number.isFinite(n) ? n : raw;
    }
    rows.push(row);
  }
  return { columns, rows };
}

async function main() {
  const { specPath, dataPath, outPath } = parseArgs(process.argv.slice(2));
  if (!existsSync(specPath)) fail(`spec not found: ${specPath}`);

  const deps = resolveDeps(dirname(specPath));
  if (!deps) {
    fail(
      "cannot resolve @observablehq/plot + jsdom. Run via experiment-run " +
      "(PRISM_APP_NODE_MODULES is injected), or `npm install @observablehq/plot jsdom` " +
      "into the project.",
    );
  }
  const { Plot, JSDOM, d3, resolvedFrom } = deps;

  let rows = [];
  let columns = [];
  if (dataPath) {
    if (!existsSync(dataPath)) fail(`data CSV not found: ${dataPath}`);
    ({ columns, rows } = parseCsv(readFileSync(dataPath, "utf-8")));
    if (rows.length === 0) fail(`no data rows in ${dataPath}`);
  }

  const mod = await import(pathToFileURL(specPath).href);
  const specFn = mod.default;
  if (typeof specFn !== "function") {
    fail("spec.mjs must `export default ({ Plot, rows, columns, d3 }) => ({ ...options })`");
  }

  const options = specFn({ Plot, rows, columns, d3 });
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    fail("spec function must return a Plot.plot() options object");
  }

  const document = new JSDOM("").window.document;
  const plot = Plot.plot({ ...options, document });
  plot.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns", "http://www.w3.org/2000/svg");
  plot.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");

  writeFileSync(outPath, plot.outerHTML + "\n", "utf-8");
  const kb = (plot.outerHTML.length / 1024).toFixed(1);
  console.log(`wrote ${outPath} (${kb} KB svg, ${rows.length} rows, deps: ${resolvedFrom})`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
