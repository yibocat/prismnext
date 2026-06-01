import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// The four auxiliary resource directories that pdfjs-dist loads on demand.
// Lector defaults to loading these from cdn.jsdelivr.net — we override that
// via documentOptions to point to these local copies instead.
const srcDirs = ["cmaps", "standard_fonts", "wasm", "iccs"];
const srcBase = join(root, "node_modules", "pdfjs-dist");
const destBase = join(root, "src", "renderer", "public", "pdfjs-dist");

// Clean previous copy (prevents stale files after pdfjs-dist upgrades)
if (existsSync(destBase)) {
  rmSync(destBase, { recursive: true });
}
mkdirSync(destBase, { recursive: true });

for (const dir of srcDirs) {
  const src = join(srcBase, dir);
  const dest = join(destBase, dir);
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
    console.log(`  Copied ${dir}/`);
  } else {
    console.warn(`  WARNING: ${dir}/ not found at ${src}`);
  }
}

console.log("pdfjs-dist assets copied to src/renderer/public/pdfjs-dist/");
