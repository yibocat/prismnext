/**
 * Native LaTeX Tools for PrismNext Pi Agent Host.
 *
 * Paper build + standalone (non-manuscript) build. Manuscript entry comes from
 * the workspace Manuscript folder pin — see manuscript-compile module.
 */

import { Type } from "@earendil-works/pi-ai";
import { fileToolOutcome } from "../../../shared/agent/runtime";
import { TOOL_NAMES } from "../../../shared/agent/tool-names";
import { compileEngineFromRelPath } from "../../../shared/compile/artifact-key";
import {
  compileManuscriptForAgent,
  compileStandaloneForAgent,
} from "../../compile/latex-service";
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

export const latexCompileTool: NativeToolDefinition = {
  name: TOOL_NAMES.latexCompile,
  label: "Compile LaTeX manuscript",
  description:
    "Build the LaTeX manuscript entry (from the workspace Manuscript folder pin) into `.workbench/compile/latex/` and return success, errors, and PDF path.",
  promptGuidelines: [
    "Manuscript entry path comes from **Workspace Folder Descriptions** (Manuscript optional compile entry) — pass `mainFile` only when the user @-mentions a different paper `.tex`.",
    "This compiles the paper — not a standalone `.tex` outside the manuscript workflow. Those use `" + TOOL_NAMES.latexCompileStandalone + "`.",
    "Never run TeX engines (pdflatex/xelatex/tectonic/…) via the bash tool.",
    "Compile once after a batch of edits; if it still fails, report structured errors — do not loop compile/edit.",
  ],
  parameters: Type.Object({
    mainFile: Type.Optional(Type.String({ description: "Optional manuscript .tex (defaults to workspace Manuscript pin)" })),
    useTexlive: Type.Optional(Type.Boolean({ description: "Force use of system TeX Live if available" })),
  }),
  permission: {
    category: "safe_write",
    extractPath: (args) => str(args.mainFile) || undefined,
  },
  async execute(args, ctx) {
    const mainFile = str(args.mainFile);
    if (mainFile && compileEngineFromRelPath(mainFile) === "typst") {
      return {
        error: `${mainFile} is a Typst file. Call \`${TOOL_NAMES.typstCompile}\` instead of latex-compile.`,
      };
    }
    return withCompileOutcome(
      await compileManuscriptForAgent(ctx.projectRoot, mainFile || undefined, args.useTexlive === true),
    );
  },
};

export const latexCompileStandaloneTool: NativeToolDefinition = {
  name: TOOL_NAMES.latexCompileStandalone,
  label: "Compile standalone LaTeX",
  description:
    "Compile a standalone, non-manuscript `.tex` in place (figure, template, slide, draft). PDF is written next to the source, not under `.workbench/compile/latex/`.",
  promptGuidelines: [
    "Use for `.tex` files that are **not** the paper entry from the Manuscript folder — e.g. \\documentclass{standalone} figures, templates, one-off docs.",
    "`mainFile` is required: the path the user @-mentioned or you found via read/ls — do not guess the paper entry.",
    `Do not use \`${TOOL_NAMES.latexCompile}\` for these files — that tool is for the manuscript only.`,
    "The PDF next to the source is enough to show in chat. Convert it only if they asked for another format.",
    "Never rasterize the PDF with bash (`sips`, `gs`, `pdftoppm`) just so you can look at it.",
    "Never run TeX engines (pdflatex/xelatex/tectonic/…) via the bash tool.",
  ],
  parameters: Type.Object({
    mainFile: Type.String({ description: "Standalone .tex path relative to the project" }),
  }),
  permission: {
    category: "safe_write",
    extractPath: (args) => str(args.mainFile) || "figure.tex",
  },
  async execute(args, ctx) {
    const mainFile = str(args.mainFile);
    if (mainFile && compileEngineFromRelPath(mainFile) === "typst") {
      return {
        error: `${mainFile} is a Typst file. Call \`${TOOL_NAMES.typstCompileStandalone}\` instead of latex-compile-standalone.`,
      };
    }
    return withCompileOutcome(
      await compileStandaloneForAgent(ctx.projectRoot, mainFile),
    );
  },
};

export const LATEX_TOOLS: NativeToolDefinition[] = [
  latexCompileTool,
  latexCompileStandaloneTool,
];
