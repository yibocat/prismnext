// prism-next/src/main/prompts/index.ts

import { PromptComposer } from "./composer";
import type { PromptLayer, PromptModule, PromptContext } from "./types";
import { createCorePersonaLayer } from "./layers/core-persona";
import { createActiveModulesLayer } from "./layers/active-modules";
import { createAgentsMdLayer } from "./layers/agents-md";
import { createCustomRulesLayer } from "./layers/custom-rules";
import { createProfileOverlayLayer } from "./layers/profile-overlay";
import { CORE_PERSONA_PROMPT } from "./layers/core-persona";
import { ALL_MODULES } from "./modules";
import { createLogger } from "../services/logger";

/** ~4 chars per token — standard English approximation for breakdown UI. */
function charsToTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

/** DJB2 — must stay in sync with PromptComposer fingerprint hashing. */
function djb2Hash(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function staticModuleContentFingerprint(): string {
  return ALL_MODULES
    .filter((m) => m.prompt)
    .map((m) => `${m.key}=${djb2Hash(m.prompt!)}`)
    .join(",");
}

const log = createLogger("prompt-manager", "agent");

const PROJECT_RULES_LAYER_ID = "custom-rules";
const AGENTS_MD_LAYER_ID = "agents-md";
const PROFILE_OVERLAY_LAYER_ID = "profile-overlay";

/** Strip per-tab profile scope for stable system file generation. */
function toStablePromptContext(ctx: PromptContext): PromptContext {
  return {
    ...ctx,
    profileId: undefined,
    profileName: undefined,
    profileInstructions: undefined,
    profileModules: undefined,
    profileSkills: undefined,
    profileMcpServers: undefined,
    profileCommands: undefined,
    profileRules: undefined,
  };
}

const STABLE_SYSTEM_EXCLUDE_LAYERS = [
  PROJECT_RULES_LAYER_ID,
  AGENTS_MD_LAYER_ID,
  PROFILE_OVERLAY_LAYER_ID,
];

class PromptManager {
  private composer = new PromptComposer();
  private initialized = false;
  private needsPersist = false;

  /** Register all layers and modules. Idempotent -- safe to call multiple times. */
  initialize(): void {
    if (this.initialized) return;

    // Layer 0: Core persona (always on, never toggleable)
    this.composer.register(createCorePersonaLayer());

    // Layer 1: AGENTS.md — project rules (before generic modules)
    this.composer.register(createAgentsMdLayer());

    // Layer 1.5: Active agent profile overlay (main session)
    this.composer.register(createProfileOverlayLayer());

    // Layer 2: Active modules (built-in toggles)
    this.composer.register(createActiveModulesLayer());

    // Layer 2.5: User custom rules
    this.composer.register(createCustomRulesLayer());

    // Precompute static layers (core-persona)
    this.composer.preComputeStatic();

    this.initialized = true;
    console.log("[prism] PromptManager initialized (5 layers, 6 modules)");
    log.info("PromptManager initialized");
  }

  // -----------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------

  /** Assemble the final prompt string from all enabled layers. */
  compose(ctx: PromptContext): string {
    this.initialize();
    return this.composer.compose(ctx);
  }

  /** Base system prompt without project rules (legacy — prefer composeStableSystem). */
  composeBase(ctx: PromptContext): string {
    this.initialize();
    return this.composer.compose(ctx, { excludeLayerIds: [PROJECT_RULES_LAYER_ID] });
  }

  /**
   * Stable system content written to `.prismnext/agent/_prism-system.md` and
   * loaded by OpenCode via `instructions`. Excludes AGENTS.md (separate file),
   * profile overlay (per-tab user block), and project rules (per-turn user block).
   */
  composeStableSystem(ctx: PromptContext): string {
    this.initialize();
    return this.composer.compose(toStablePromptContext(ctx), {
      excludeLayerIds: STABLE_SYSTEM_EXCLUDE_LAYERS,
    });
  }

  /** Active agent profile overlay — injected every turn as a user content block. */
  composeProfileOverlay(ctx: PromptContext): string {
    this.initialize();
    return this.composer.compose(ctx, { onlyLayerIds: [PROFILE_OVERLAY_LAYER_ID] });
  }

  /** Project rules only — re-read from disk and injected on every chat turn. */
  composeProjectRules(ctx: PromptContext): string {
    this.initialize();
    return this.composer.compose(ctx, { onlyLayerIds: [PROJECT_RULES_LAYER_ID] });
  }

  /** Get all layers (for settings UI introspection). */
  getLayers(): readonly PromptLayer[] {
    this.initialize();
    return this.composer.getLayers();
  }

  /** Get all modules with their current toggle states.
   *  Strips non-cloneable properties (build, prompt) for IPC transfer. */
  getModules(): Array<{
    key: string;
    label: string;
    description: string;
    enabled: boolean;
    source: string;
    autoGenerated?: boolean;
  }> {
    return ALL_MODULES.map((m) => ({
      key: m.key,
      label: m.label,
      description: m.description,
      enabled: m.enabled,
      source: m.source,
      autoGenerated: m.autoGenerated,
    }));
  }

  /** Toggle a module on/off. Marks for persistence. */
  setModuleEnabled(key: string, enabled: boolean): void {
    const mod = ALL_MODULES.find((m) => m.key === key);
    if (mod) {
      mod.enabled = enabled;
      this.composer.invalidate();
      this.needsPersist = true;
    }
  }

  /** Restore module states from persisted settings. */
  loadModuleStates(states: Record<string, boolean>): void {
    for (const [key, enabled] of Object.entries(states)) {
      const mod = ALL_MODULES.find((m) => m.key === key);
      if (mod) {
        mod.enabled = enabled;
      }
    }
    this.composer.invalidate();
    this.needsPersist = false;
  }

  /** Export current module states for persistence. */
  dumpModuleStates(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const m of ALL_MODULES) {
      result[m.key] = m.enabled;
    }
    return result;
  }

  /** Toggle a layer on/off. Only works for userToggleable layers. */
  setLayerEnabled(id: string, enabled: boolean): void {
    this.composer.setEnabled(id, enabled);
  }

  /** Export current layer toggle states for persistence. */
  dumpLayerStates(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const l of this.composer.getLayers()) {
      if (l.userToggleable) {
        result[l.id] = l.enabled;
      }
    }
    return result;
  }

  /** Restore layer toggle states from persisted settings. */
  loadLayerStates(states: Record<string, boolean>): void {
    for (const [id, enabled] of Object.entries(states)) {
      if (id === "user-instructions") continue;
      this.composer.setEnabled(id, enabled);
    }
    this.composer.invalidate();
  }

  /** Estimate per-layer token counts for the context-window breakdown panel.
   *  Uses character-based estimation (1 token ≈ 4 chars) since we don't
   *  have a real tokenizer. OpenCode reports the true total — we only need
   *  approximate proportions for the visual breakdown.
   *
   *  Category mapping:
   *  - Custom system prompt → user-instructions (replaces core persona)
   *  - Default persona only → core-persona
   *  - custom-rules layer → project-rules (not modules)
   *
   *  Returns a map of category key → estimated token count. */
  estimateTokenBreakdown(ctx: PromptContext): Record<string, number> {
    this.initialize();
    const breakdown: Record<string, number> = {};

    const custom = ctx.userCustomPrompt?.trim();
    if (custom) {
      breakdown["user-instructions"] = charsToTokens(custom);
    } else {
      const coreLayer = this.composer.getLayers().find((l) => l.id === "core-persona");
      if (coreLayer?.enabled) {
        breakdown["core-persona"] = charsToTokens(CORE_PERSONA_PROMPT);
      }
    }

    const LAYER_TO_CATEGORY: Record<string, string> = {
      "active-modules": "modules",
      "custom-rules": "project-rules",
      "agents-md": "project-instructions",
    };

    for (const layer of this.composer.getLayers()) {
      if (layer.id === "core-persona") continue;
      if (!layer.enabled) continue;
      try {
        const text = layer.build(ctx);
        if (text) {
          const catKey = LAYER_TO_CATEGORY[layer.id] || layer.id;
          breakdown[catKey] = charsToTokens(text);
        }
      } catch {
        // Layer build failed — skip in breakdown
      }
    }

    return breakdown;
  }

  /** Stable fingerprint for `_prism-system.md` sync (excludes per-turn / per-tab layers). */
  computePromptFingerprint(ctx: PromptContext): string {
    this.initialize();
    const stableCtx = toStablePromptContext(ctx);
    const base = this.composer.fingerprint(stableCtx, {
      excludeLayerIds: STABLE_SYSTEM_EXCLUDE_LAYERS,
    });
    const mod = ALL_MODULES.map((m) => `${m.key}=${m.enabled ? 1 : 0}`).join(",");
    const modContent = staticModuleContentFingerprint();
    return `${base}|${mod}|${modContent}`;
  }

  /** Invalidate all caches. Call when settings or project data changes. */
  invalidate(): void {
    this.composer.invalidate();
  }

  /** Whether module states changed since last load/save. */
  get needsModulePersist(): boolean {
    return this.needsPersist;
  }
}

/** Singleton -- the single entry point for all prompt assembly. */
export const promptManager = new PromptManager();
