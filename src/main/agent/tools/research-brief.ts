/**
 * Native Research Brief Tools for PrismNext Pi Agent Host.
 *
 * 2 tools covering reading and updating the project research brief (.brief.md).
 */

import { Type } from "@earendil-works/pi-ai";
import { TOOL_NAMES } from "../../../shared/agent/tool-names";
import {
  readResearchBrief,
  updateResearchBriefSection,
} from "../../services/research-brief-service";
import type { NativeToolDefinition } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export const researchBriefReadTool: NativeToolDefinition = {
  name: TOOL_NAMES.researchBriefRead,
  label: "Read Research Brief",
  description: "Read the project research design brief (.brief.md at project root).",
  parameters: Type.Object({}),
  permission: {
    category: "read_only",
  },
  async execute(_args, ctx) {
    return readResearchBrief(ctx.projectRoot, { ensure: true });
  },
};

export const researchBriefUpdateTool: NativeToolDefinition = {
  name: TOOL_NAMES.researchBriefUpdate,
  label: "Update Research Brief",
  description: "Update one section of the project research brief (.brief.md).",
  promptGuidelines: [
    "This is the ONLY sanctioned way to write .brief.md — never edit it with generic edit/write.",
    "Read the brief first to match an existing section header; use `append: true` to add to a section instead of replacing it.",
    "Update the brief whenever the research question, design, or hypotheses change so the living document stays current.",
  ],
  parameters: Type.Object({
    section: Type.String({ minLength: 1, description: "Section header name to update" }),
    content: Type.String({ minLength: 1, description: "Markdown body content for this section" }),
    append: Type.Optional(Type.Boolean({ description: "If true, append to existing section content" })),
  }),
  permission: {
    category: "safe_write",
    extractPath: () => ".brief.md",
  },
  async execute(args, ctx) {
    const section = str(args.section);
    const content = typeof args.content === "string" ? args.content : "";
    if (!section || !content.trim()) {
      return { ok: false, error: "missing_section_or_content" };
    }
    return updateResearchBriefSection(ctx.projectRoot, section, content, {
      append: args.append === true,
    });
  },
};

export const RESEARCH_BRIEF_TOOLS: NativeToolDefinition[] = [
  researchBriefReadTool,
  researchBriefUpdateTool,
];
