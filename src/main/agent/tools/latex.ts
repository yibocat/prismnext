/**
 * Native LaTeX Tools for PrismNext Pi Agent Host.
 *
 * 2 tools covering root document resolution and manuscript compilation.
 */

import { Type } from "@earendil-works/pi-ai";
import { TOOL_NAMES } from "../../../shared/tool-names";
import { resolveLatexRoot } from "../../lib/latex-root";
import { compileForAgent } from "../../services/latex-service";
import type { NativeToolDefinition } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export const latexRootTool: NativeToolDefinition = {
  name: TOOL_NAMES.latexRoot,
  label: "Resolve LaTeX Root",
  description: "Find the active root document, engine, and build directory for the manuscript.",
  promptGuidelines: [
    "Call this before compiling or before reasoning about build paths; `mainFile` is optional and auto-detected when omitted.",
    "The returned `buildDir` is where latex-compile keeps its artifacts — use it when you need to find compiled output.",
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
  description: "Compile the TeX workspace manuscript into `.prismnext/compile/`.",
  promptGuidelines: [
    "This compiles the paper — the workspace manuscript root — not other `.tex` files.",
    "Never run TeX engines (pdflatex/xelatex/tectonic/…) via the bash tool — use this tool so builds stay under `.prismnext/compile/` and the manuscript folder stays clean.",
  ],
  parameters: Type.Object({
    mainFile: Type.Optional(Type.String({ description: "Optional explicit main file path" })),
    useTexlive: Type.Optional(Type.Boolean({ description: "Force use of system TeX Live if available" })),
  }),
  permission: {
    category: "shell_exec",
    extractPath: (args) => str(args.mainFile) || "main.tex",
  },
  async execute(args, ctx) {
    const mainFile = str(args.mainFile);
    return compileForAgent(ctx.projectRoot, mainFile || undefined, args.useTexlive === true);
  },
};

export const LATEX_TOOLS: NativeToolDefinition[] = [
  latexRootTool,
  latexCompileTool,
];
