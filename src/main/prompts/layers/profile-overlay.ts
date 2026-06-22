import type { PromptLayer } from "../types";

/** Active main-session profile instructions (from Agent Profiles). */
export function createProfileOverlayLayer(): PromptLayer {
  return {
    id: "profile-overlay",
    priority: 1.5,
    source: "plugin",
    userToggleable: false,
    enabled: true,
    isStatic: false,
    build(ctx) {
      if (!ctx.profileInstructions?.trim()) return "";
      const title = ctx.profileName?.trim() || ctx.profileId || "Profile";
      return `## Active Agent Profile: ${title}\n\n${ctx.profileInstructions.trim()}`;
    },
  };
}
