/**
 * Native Typst tools for the PrismNext Pi agent host.
 */

import { Type } from "@earendil-works/pi-ai";
import { fileToolOutcome } from "../../../shared/agent/runtime";
import { TOOL_NAMES } from "../../../shared/agent/tool-names";
import { compileEngineFromRelPath } from "../../../shared/compile/artifact-key";
import { resolveTypstRoot } from "../../lib/typst-root";
import {
  compileStandaloneTypstForAgent,
  compileTypstForAgent,
} from "../../compile/typst";
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

export const typstRootTool: NativeToolDefinition = {
  name: TOOL_NAMES.typstRoot,
  label: "Resolve Typst Root",
  description: "Find the active Typst paper root and `.workbench/compile/typst` build directory.",
  promptGuidelines: [
    "Call this before compiling a Typst paper; `mainFile` is optional and auto-detected when omitted.",
    "The returned `buildDir` is `.workbench/compile/typst` for the paper. Standalone `.typ` files compile next to the source.",
    "The Typst CLI always uses `--root` = the project folder. Nested drafts may `#include` / `#image` / `bibliography` files elsewhere in the project via `../`. Do not use OS-absolute paths (`/Users/…`).",
  ],
  parameters: Type.Object({
    mainFile: Type.Optional(Type.String({ description: "Optional explicit main file path" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const mainFile = str(args.mainFile);
    if (mainFile && compileEngineFromRelPath(mainFile) === "latex") {
      return {
        error: `${mainFile} is a LaTeX file. Call \`${TOOL_NAMES.latexRoot}\` instead.`,
        projectRoot: ctx.projectRoot,
      };
    }
    const resolved = resolveTypstRoot(ctx.projectRoot, mainFile || undefined);
    if (!resolved) {
      return { error: "Could not resolve Typst main file.", projectRoot: ctx.projectRoot };
    }
    return {
      mainFile: resolved.mainFile,
      absolutePath: resolved.absolutePath,
      buildDir: resolved.buildDir,
      manuscriptFolder: resolved.manuscriptFolder,
      resolution: resolved.resolution,
    };
  },
};

export const typstCompileTool: NativeToolDefinition = {
  name: TOOL_NAMES.typstCompile,
  label: "Compile Typst",
  description: "Compile the Typst manuscript into `.workbench/compile/typst/`.",
  promptGuidelines: [
    "This compiles the paper Typst root into `.workbench/compile/typst/`.",
    "Use this for any `.typ` under the manuscript folder, including drafts — not only `main.typ`.",
    `Do not also call \`${TOOL_NAMES.typstCompileStandalone}\` in the same turn.`,
    `Do not pass a standalone figure here. That file uses \`${TOOL_NAMES.typstCompileStandalone}\`.`,
    "Compile once after a batch of edits. If it still fails, report the errors — do not loop compile/edit.",
    "Never run `typst compile` via the bash tool.",
    "`typst compile` is invoked with `--root` = the project folder, so `#image` / `#include` / `bibliography` paths must stay inside the project (relative `../` from a nested draft is fine).",
  ],
  parameters: Type.Object({
    mainFile: Type.Optional(Type.String({ description: "Optional explicit manuscript main file path" })),
  }),
  permission: {
    category: "safe_write",
    extractPath: (args) => str(args.mainFile) || undefined,
  },
  async execute(args, ctx) {
    const mainFile = str(args.mainFile);
    return withCompileOutcome(await compileTypstForAgent(ctx.projectRoot, mainFile || undefined));
  },
};

export const typstCompileStandaloneTool: NativeToolDefinition = {
  name: TOOL_NAMES.typstCompileStandalone,
  label: "Compile standalone Typst",
  description:
    "Compile a standalone `.typ` in place. The PDF is written next to the source, not under `.workbench/compile/typst/`.",
  promptGuidelines: [
    "Use this only for a `.typ` **outside** the configured manuscript folder.",
    "`mainFile` is required.",
    `A file under the manuscript folder is the paper — use \`${TOOL_NAMES.typstCompile}\`, not this tool.`,
    `Do not also call \`${TOOL_NAMES.typstCompile}\` in the same turn.`,
    "Never run `typst compile` via the bash tool.",
  ],
  parameters: Type.Object({
    mainFile: Type.String({ description: "Standalone .typ path relative to the project" }),
  }),
  permission: {
    category: "safe_write",
    extractPath: (args) => str(args.mainFile) || "figure.typ",
  },
  async execute(args, ctx) {
    return withCompileOutcome(
      await compileStandaloneTypstForAgent(ctx.projectRoot, str(args.mainFile)),
    );
  },
};

export const TYPST_TOOLS: NativeToolDefinition[] = [
  typstRootTool,
  typstCompileTool,
  typstCompileStandaloneTool,
];
