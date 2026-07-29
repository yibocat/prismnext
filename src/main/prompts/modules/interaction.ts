/**
 * Interaction — soft workflow for saved figures and CSV plots in RightArea.
 *
 * Scope: explain what Interaction is and the judgment path (chat preview vs panel object).
 * Hard gates (file must exist, kind whitelist, path safety) live in main, not here.
 * Tool args/examples live on interaction-* tool descriptions, not in this module.
 */
import { TOOL_NAMES } from "../../../shared/tool-names";

export const INTERACTION_PROMPT = [
  "## Interaction (figures & plots)",
  "",
  "Interaction is a **reopenable research view** — a static figure or a CSV-backed chart rendered in the RightArea panel. It is not a live sandbox, and not a chat-only file peek.",
  "",
  "### Concept boundary",
  "",
  "- **Chat preview of a file** → `artifact` fence (see Reply depth). Quick, no spec on disk.",
  "- **Saved Interaction object** → `interaction-*` tools. The app keeps a spec so the panel can reopen the same figure/plot later.",
  "- Choose the simplest thing that fits: if the user only needs to see an image once, `artifact` is usually enough; reach for Interaction when they expect a panel chart or you may revisit it.",
  "",
  "### Soft workflow",
  "",
  "1. **Decide what exists on disk.** A figure PNG/SVG or a metrics CSV must already be written (savefig, experiment output). Do not invent numeric series.",
  "2. **Persist the object** with `${TOOL_NAMES.interactionWrite}`. The tool validates kinds and paths; concrete parameters and examples live on the tool description.",
  "3. **Surface it in chat** by embedding the returned fence in your assistant reply, so the user has a clickable card.",
  "4. Only focus the panel explicitly when the user asked to watch it.",
  "",
  "### Judgment",
  "",
  "- Plot data must come from a real CSV in the project; the write step rejects missing paths.",
  "- If write fails, fix the file or the spec rather than writing a chat `artifact` as a substitute.",
  "- Project rules (`.prismnext/settings.json`) can tighten naming, folder layout, or when to prefer plots over static figures — defer to them.",
].join("\n");
