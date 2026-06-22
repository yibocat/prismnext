// prism-next/src/main/prompts/layers/active-modules.ts

import type { PromptLayer, PromptContext } from "../types";
import { resolveActiveModules } from "../resolve-active-modules";
import { createLogger } from "../../services/logger";

const log = createLogger("active-modules", "agent");

/** Layer 1: Collects and joins all enabled module prompts. */
export function createActiveModulesLayer(): PromptLayer {
  return {
    id: "active-modules",
    priority: 2,
    source: "app",
    userToggleable: true,
    enabled: true, // the LAYER is enabled; individual modules toggle inside
    isStatic: false,
    build: (ctx: PromptContext) => {
      const enabled = resolveActiveModules(ctx);
      if (enabled.length === 0) return "";

      const parts: string[] = [];
      for (const mod of enabled) {
        try {
          let text: string;
          if (mod.build) {
            text = mod.build(ctx);
          } else if (mod.prompt) {
            text = mod.prompt;
          } else {
            log.warn(`Module "${mod.key}" has no prompt or build function`);
            continue;
          }
          if (text) parts.push(text);
        } catch (err) {
          log.warn(`Module "${mod.key}" failed`, { error: (err as Error).message });
        }
      }

      log.info(
        `Modules assembled: ${parts.length}/${enabled.length} active ` +
        `(${parts.reduce((s, p) => s + p.length, 0)} chars)`,
        { activeModules: enabled.map((m) => m.key) },
      );
      return parts.length > 0 ? parts.join("\n\n") : "";
    },
  };
}
