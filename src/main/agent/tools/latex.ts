/**
 * Native LaTeX Tools for PrismNext Pi Agent Host.
 *
 * Paper root / paper compile / standalone-figure compile.
 */

import { Type } from "@earendil-works/pi-ai";
import { fileToolOutcome } from "../../../shared/agent-runtime";
import { TOOL_NAMES } from "../../../shared/tool-names";
import { resolveLatexRoot } from "../../lib/latex-root";
import {
  compileManuscriptForAgent,
  compileStandaloneForAgent,
} from "../../services/latex-service";
import type { NativeToolDefinition } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function withCompileOutcome(compiled: unknown): unknown {
  if (!compiled || typeof compiled !== "object") return compiled;
  const rec = compiled as Record<string, unknown>;
  if (rec.success === true && typeof rec.pdfPath === "string" && rec.pdfPath.trim()) {
    return { ...rec, outcome: fileToolOutcome(rec.pdfPath) };
  }
  return compiled;
}

export const latexRootTool: NativeToolDefinition = {
  name: TOOL_NAMES.latexRoot,
  label: "Resolve LaTeX Root",
  description: "Find the active root document, engine, and build directory for the manuscript.",
  promptGuidelines: [
    "Call this before compiling the paper or before reasoning about paper build paths; `mainFile` is optional and auto-detected when omitted.",
    "The returned `buildDir` is `.workbench/compile/` for the paper. Standalone figures do not use this cache — their PDF sits next to the source.",
  ],
  parameters: Type.Object({
    mainFile: Type.Optional(Type.String({ description: "Optional explicit main file path" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const mainFile = str(args.mainFile);
    const resolved = resolveLatexRoot(ctx.projectRoot, mainFile || undefined);
    if (!resolved) {
      return { error: "Could not resolve LaTeX main file.", projectRoot: ctx.projectRoot };
    }
    return {
      mainFile: resolved.mainFile,
      absolutePath: resolved.absolutePath,
      engine: resolved.engine,
      bibTool: resolved.bibTool,
      buildDir: resolved.buildDir,
      manuscriptFolder: resolved.manuscriptFolder,
      resolution: resolved.resolution,
    };
  },
};

export const latexCompileTool: NativeToolDefinition = {
  name: TOOL_NAMES.latexCompile,
  label: "Compile LaTeX",
  description: "Compile the TeX workspace manuscript into `.workbench/compile/`.",
  promptGuidelines: [
    "This compiles the paper — the workspace manuscript root — into `.workbench/compile/`.",
    `Do not pass a \\documentclass{standalone} figure here. That file uses \`${TOOL_NAMES.latexCompileStandalone}\` and compiles in place next to the source.`,
    "Never run TeX engines (pdflatex/xelatex/tectonic/…) via the bash tool.",
  ],
  parameters: Type.Object({
    mainFile: Type.Optional(Type.String({ description: "Optional explicit manuscript main file path" })),
    useTexlive: Type.Optional(Type.Boolean({ description: "Force use of system TeX Live if available" })),
  }),
  permission: {
    category: "safe_write",
    extractPath: (args) => str(args.mainFile) || "main.tex",
  },
  async execute(args, ctx) {
    const mainFile = str(args.mainFile);
    return withCompileOutcome(
      await compileManuscriptForAgent(ctx.projectRoot, mainFile || undefined, args.useTexlive === true),
    );
  },
};

export const latexCompileStandaloneTool: NativeToolDefinition = {
  name: TOOL_NAMES.latexCompileStandalone,
  label: "Compile standalone figure",
  description:
    "Compile a standalone / TikZ figure `.tex` in place. The PDF is written next to the source, not under `.workbench/compile/`.",
  promptGuidelines: [
    "Use this when the user wants to compile a standalone / TikZ figure — a `.tex` whose document class is `standalone`.",
    "`mainFile` is required: the figure path they named or you found. Do not guess the paper root.",
    `Do not use \`${TOOL_NAMES.latexCompile}\` for these files. That tool is the paper pipeline only.`,
    "The PDF next to the source is enough to show in chat. Convert it only if they asked for another format.",
    "Never rasterize the PDF with bash (`sips`, `gs`, `pdftoppm`) just so you can look at it.",
    "Never run TeX engines (pdflatex/xelatex/tectonic/…) via the bash tool.",
  ],
  parameters: Type.Object({
    mainFile: Type.String({ description: "Standalone figure .tex path relative to the project" }),
  }),
  permission: {
    category: "safe_write",
    extractPath: (args) => str(args.mainFile) || "figure.tex",
  },
  async execute(args, ctx) {
    return withCompileOutcome(
      await compileStandaloneForAgent(ctx.projectRoot, str(args.mainFile)),
    );
  },
};

export const LATEX_TOOLS: NativeToolDefinition[] = [
  latexRootTool,
  latexCompileTool,
  latexCompileStandaloneTool,
];
