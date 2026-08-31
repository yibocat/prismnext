/**
 * Native Typst tools for the PrismNext Pi agent host.
 *
 * Manuscript build + standalone (non-manuscript) build. Manuscript entry comes from
 * the workspace Manuscript folder pin — see manuscript-compile module.
 */

import { Type } from "@earendil-works/pi-ai";
import { fileToolOutcome } from "../../../shared/agent/runtime";
import { TOOL_NAMES } from "../../../shared/agent/tool-names";
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

export const typstCompileTool: NativeToolDefinition = {
  name: TOOL_NAMES.typstCompile,
  label: "Build Typst manuscript",
  description:
    "Build the Typst manuscript entry (from the workspace Manuscript folder pin) and return success, structured errors from the Typst log, and PDF path.",
  promptGuidelines: [
    "Manuscript entry path comes from **Workspace Folder Descriptions** (Manuscript optional compile entry) — pass `mainFile` only when the user @-mentions a different paper `.typ`.",
    "Use after a batch of manuscript edits to verify the paper builds — read the returned errors to fix sources; do not loop build/edit blindly.",
    `Do not use \`${TOOL_NAMES.typstCompileStandalone}\` for the manuscript entry — that tool is for .typ files outside the paper build (figures, templates, drafts).`,
    "Never invoke Typst via the bash tool.",
    "Build uses `--root` = the project folder; `#include` / `#image` / `bibliography` paths must stay inside the project (relative `../` from a nested draft is fine).",
  ],
  parameters: Type.Object({
    mainFile: Type.Optional(Type.String({ description: "Optional manuscript .typ (defaults to workspace Manuscript pin)" })),
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
  label: "Build standalone Typst",
  description:
    "Build a standalone, non-manuscript `.typ` in place (figure, template, slide, draft). PDF is written next to the source, not under `.workbench/compile/typst/`.",
  promptGuidelines: [
    "Use for `.typ` files that are **not** the paper entry from the Manuscript folder — figures, templates, one-off docs.",
    "`mainFile` is required — the path the user named or you found via read/ls.",
    `Manuscript .typ under the Manuscript folder → \`${TOOL_NAMES.typstCompile}\`, not this tool.`,
    "Never invoke Typst via the bash tool.",
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
  typstCompileTool,
  typstCompileStandaloneTool,
];
