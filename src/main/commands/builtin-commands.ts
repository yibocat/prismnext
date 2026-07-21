// prism-next/src/main/commands/builtin-commands.ts
import type { CommandDef } from "./types";

/**
 * All built-in commands.
 *
 * ─── ADDING A NEW COMMAND ────────────────────────────────────────────
 *
 * There are two kinds of commands:
 *
 *   AI command (no `action`)
 *     → template is expanded in the background and sent to the AI agent
 *       together with any free text the user typed. The user only sees
 *       the /name chip — never the expanded template.
 *
 *   Action command (has `action`)
 *     → pressing Enter runs a local JavaScript handler INSTEAD of sending
 *       to AI. If the user ALSO typed free text, that text goes to AI
 *       while the action runs locally. A status card (running → success /
 *       error) appears in the chat.
 *
 * ─── STEP-BY-STEP: Adding a new AI command ───────────────────────────
 *
 *   1. Add an entry to BUILTIN_COMMANDS below (this file):
 *
 *      {
 *        id: "builtin:my-cmd",
 *        name: "my-cmd",
 *        description: "What this command does (shown in / dropdown)",
 *        source: "builtin",
 *        template: "The text that will be sent to the AI when user presses Enter.",
 *        order: 50,        // lower = appears earlier in the dropdown
 *        enabled: true,
 *      }
 *
 *   2. Done. The command engine handles parsing, expansion, and dispatch.
 *      No renderer-side changes needed.
 *
 * ─── STEP-BY-STEP: Adding a new Action command ───────────────────────
 *
 *   1. Add an entry to BUILTIN_COMMANDS below with an `action` field (this file):
 *
 *      {
 *        id: "builtin:my-action",
 *        name: "my-action",
 *        description: "What this action does",
 *        source: "builtin",
 *        template: "Optional template text (unused if action always runs)",
 *        action: "my-action-key",   // ← unique key for the action handler
 *        order: 100,
 *        enabled: true,
 *      }
 *
 *   2. Register the action handler in:
 *      src/renderer/actions/builtin-actions.ts
 *
 *      actionRegistry.register("my-action-key", () => {
 *        // your local logic here
 *        return "Feedback message shown in the action-status card";
 *      });
 *
 *   3. Done. The renderer's ActionRegistry will match "my-action-key"
 *      to your handler at send time.
 *
 * ─── NOTE ────────────────────────────────────────────────────────────
 *
 *   The `action` field is just a STRING KEY. It does not contain any
 *   executable code. The actual function lives in the ActionRegistry
 *   (src/renderer/actions/). If you add an action key here but forget
 *   to register the handler, the user will see an error status card.
 */
export const BUILTIN_COMMANDS: CommandDef[] = [
  // ── AI commands (no action — sent to AI) ──

  {
    id: "builtin:setup",
    name: "setup",
    description: "Scaffold AGENTS.md from project metadata (fast local scan)",
    source: "builtin",
    template: "",
    action: "setup-agents-md",
    order: 0,
    enabled: true,
  },
  {
    id: "builtin:compact",
    name: "compact",
    description: "Compact conversation context to free token space",
    source: "builtin",
    template: "",
    action: "compact-context",
    order: 1,
    enabled: true,
  },
  {
    id: "builtin:undo",
    name: "undo",
    description: "Restore workspace files to the previous turn",
    source: "builtin",
    template: "",
    action: "restore-previous-turn",
    order: 2,
    enabled: true,
  },
  {
    id: "builtin:redo",
    name: "redo",
    description: "Undo the last file restore",
    source: "builtin",
    template: "",
    action: "undo-last-restore",
    order: 3,
    enabled: true,
  },
  // ── Action commands (has `action` — runs locally with chat feedback) ──
  // Note: Plan is a composer Mode (slash panel → Modes), not a Command.

  {
    id: "builtin:compile",
    name: "compile",
    description: "Compile the LaTeX document and show the result",
    source: "builtin",
    template: "Compile the current LaTeX document.",
    action: "compile-document",
    order: 100,
    enabled: true,
  },
  {
    id: "builtin:bib-check",
    name: "bib-check",
    description: "Check .tex ↔ .bib ↔ library.db citation health (local IPC — no AI)",
    source: "builtin",
    template: "",
    action: "bib-check",
    order: 101,
    enabled: true,
  },
  {
    id: "builtin:brief",
    name: "brief",
    description: "Ensure research brief exists; AI reads/updates .prismnext/research/brief.md",
    source: "builtin",
    template: [
      "Research brief workflow (binding):",
      "1. Call `research-brief-read` first — do not guess project design from chat memory.",
      "2. Work from the brief sections; use `research-brief-update` for changed sections only (one section per call) after the user confirms.",
      "3. Do not use generic edit/write on `.prismnext/research/brief.md`.",
      "",
      "When the user request below is empty, summarize which sections are still placeholder-only and ask what to refine.",
      "",
      "User request:",
      "$ARGUMENTS",
    ].join("\n"),
    action: "ensure-research-brief",
    order: 102,
    enabled: true,
  },
];
