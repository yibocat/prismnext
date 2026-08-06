import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Project brief — what `.brief.md` is (intellectual spine), not how to do research design.
 * Section schema and patch mechanics live in shared/research-brief.ts and brief tools.
 */
export const PROJECT_BRIEF_PROMPT = [
  "## Project brief (`.brief.md`)",
  "",
  "The project's **intellectual spine** — core ideas, claims, methodology thinking, and why this",
  "work matters. Everything else (literature, experiments, writing) should **align with** this",
  "line of thought, not define it.",
  "",
  "### What this is",
  "",
  "- A **living thesis** at the project root: the main story you are building and revising.",
  "- May be narrative, bullets, or mixed structure — **no required outline**.",
  "- The bundled template (Research question, Hypotheses, …) is a **starting scaffold only**;",
  "  users may rename, delete, or ignore sections.",
  "",
  "### Voice",
  "",
  "- Write as the **researcher's own voice** — **first person** (I / we), not third-person about",
  "  \"the project\" or \"the user.\"",
  "- Example: \"I want to test whether…\" / \"We assume…\" — not \"This project aims to…\" or",
  "  \"The researcher believes…\".",
  "- When updating via `" +
    TOOL_NAMES.researchBriefUpdate +
    "`, match the user's existing voice if they already use a different style.",
  "",
  "### What this is not",
  "",
  "- **Not chat memory** — it is on disk; read it when alignment matters.",
  "- **Not a scratchpad** — working documents (analysis, derivations, decision",
  "  records, specs) live in the project's **`specs/`** folder (a plain folder,",
  "  not an app-managed one); the brief holds only what has settled.",
  "- **Not AGENTS.md, rules, or modules** — not product instructions to the agent.",
  "- **Not an experiment plan** — protocols, runs, and ablations belong in **Experiments**.",
  "- **Not a frozen spec** — it evolves as thinking sharpens or evidence pushes back.",
  "",
  "### When to read or update",
  "",
  "- **Driven by dialogue and thinking** — not a fixed checklist or \"major milestone only.\"",
  "  As you and the user explore, critique, and refine, decide whether the on-disk spine should change.",
  "- **Read** (`" +
    TOOL_NAMES.researchBriefRead +
    "`) when grounding the conversation — intent unclear, aligning literature/writing/experiments,",
  "  or the user refers to project direction. Read to **align**, not to memorize.",
  "- **Capture on disk** (`" +
    TOOL_NAMES.researchBriefUpdate +
    "` after user confirmation) when something worth keeping emerges from discussion —",
  "  **diverse and non-templated**, e.g.:",
  "  - a small tweak to research direction or framing",
  "  - a shift in approach or a critical-thinking summary you agreed on",
  "  - a sharpened claim, hypothesis, or open question (large or small)",
  "  - methodology intuition, experiment-design spark, or a new idea worth preserving",
  "- Match the **user's format** — patch matching `##` sections when they exist;",
  "  narrative bullets or free prose are fine. No forced scaffold.",
  "- The user may rewrite the whole file in **Files** anytime.",
  "- Never use generic edit/write on `.brief.md` — brief tools only (agents).",
  "",
  "### Judgment",
  "",
  "- Prefer the brief's **substance** over its headings — empty or missing sections are OK early on.",
  "- Default to **first-person** prose unless the file already uses another voice.",
  "- Do not treat the brief as a checklist gate (e.g. \"nine sections full before X\").",
  "- If chat and brief disagree, the brief wins for **project intent**; ask before overwriting user prose.",
].join("\n");
