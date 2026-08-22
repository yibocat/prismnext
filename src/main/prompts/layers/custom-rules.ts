// prism-next/src/main/prompts/layers/custom-rules.ts

import type { PromptLayer, PromptContext } from "../types";
import { createLogger } from "../../app/logger";

const log = createLogger("custom-rules", "agent");

/** Layer 2.5: Injects user-created custom rules after built-in modules
 *  (priority 2) — the last layer in the stack. */
export function createCustomRulesLayer(): PromptLayer {
  return {
    id: "custom-rules",
    priority: 2.5,
    source: "user",
    userToggleable: true,
    enabled: true,
    isStatic: false,
    build: (ctx: PromptContext) => {
      const rules = ctx.customRules;
      if (!rules || rules.length === 0) return "";

      const parts = rules.map((r) =>
        `## ${r.name}\n\n${r.content}`
      );

      log.info(
        `Custom rules assembled: ${parts.length} rule(s) (${parts.reduce((s, p) => s + p.length, 0)} chars)`,
        { rules: rules.map((r) => r.name) },
      );
      return parts.join("\n\n");
    },
  };
}
