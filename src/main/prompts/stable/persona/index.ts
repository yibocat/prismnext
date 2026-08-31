import type { PromptLayer, PromptContext } from "../../types";
import { CORE_PERSONA_PROMPT } from "./prompt";

export { CORE_PERSONA_PROMPT };

export function createCorePersonaLayer(): PromptLayer {
  return {
    id: "core-persona",
    priority: 0,
    source: "app",
    userToggleable: false,
    enabled: true,
    isStatic: false,
    build: (ctx: PromptContext) => {
      const custom = ctx.userCustomPrompt?.trim();
      if (custom) return custom;
      return CORE_PERSONA_PROMPT;
    },
  };
}
