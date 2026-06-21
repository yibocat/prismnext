// prism-next/src/main/prompts/layers/agents-md.ts

import type { PromptLayer, PromptContext } from "../types";

/** Layer 1: Project-level instructions from .prismnext/agent/AGENTS.md */
export function createAgentsMdLayer(): PromptLayer {
  return {
    id: "agents-md",
    priority: 1,
    source: "project",
    userToggleable: true,
    enabled: true,
    isStatic: false,
    build: (ctx: PromptContext) => {
      const content = ctx.agentsMdContent?.trim();
      if (content) {
        return "## Project Instructions (AGENTS.md)\n\n" + content;
      }
      return "";
    },
  };
}
