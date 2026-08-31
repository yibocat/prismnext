import type { PromptContext } from "../types";
import { createCorePersonaLayer } from "./persona";
import { RESEARCH_REASONING_PROMPT } from "./research-reasoning";
import { REPLY_DEPTH_PROMPT } from "./reply-depth";
import { buildWorkspacePrompt } from "./workspace-folders";
import { GLOBAL_MODULE_ORDER } from "./order";

export { CORE_PERSONA_PROMPT, createCorePersonaLayer } from "./persona";
export { RESEARCH_REASONING_PROMPT } from "./research-reasoning";
export { REPLY_DEPTH_PROMPT } from "./reply-depth";
export { buildWorkspacePrompt } from "./workspace-folders";
export { GLOBAL_MODULE_ORDER, type GlobalModuleKey } from "./order";

function buildGlobalBlock(key: (typeof GLOBAL_MODULE_ORDER)[number], ctx: PromptContext): string {
  switch (key) {
    case "research-reasoning":
      return RESEARCH_REASONING_PROMPT;
    case "reply-depth":
      return REPLY_DEPTH_PROMPT;
    case "workspace-folders":
      return ctx.workspaceDirs ? buildWorkspacePrompt(ctx.workspaceDirs) : "";
  }
}

/** Assemble segment ② — persona + global modules in GLOBAL_MODULE_ORDER. */
export function composeStableSystem(ctx: PromptContext = {}): string {
  const persona = createCorePersonaLayer().build(ctx);
  const parts: string[] = [];
  if (persona) parts.push(persona);
  for (const key of GLOBAL_MODULE_ORDER) {
    const text = buildGlobalBlock(key, ctx).trim();
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}
