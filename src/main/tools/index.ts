import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/**
 * # prism‑next Built‑in Custom Tools Registry
 *
 * ## Architecture
 *
 * prism-next keeps built-in OpenCode tools in the app-level config directory:
 *   `$XDG_CONFIG_HOME/opencode/tools/`
 *
 * `AcpService` sets `XDG_CONFIG_HOME` to `<userData>/opencode-server/config/`,
 * so tools placed at `<userData>/opencode-server/config/opencode/tools/`
 * are discovered by OpenCode without creating project-level `.opencode/`.
 *
 * `AcpService.syncBuiltinTools()` copies the files defined in `src/main/tools/`
 * into that directory every time the app starts.
 *
 * ## Adding a new prism‑next built‑in tool
 *
 * ### Step 1 — Define the tool (OpenCode side)
 *
 * Create `src/main/tools/<tool-name>.ts`:
 *
 * ```typescript
 * import { tool } from "@opencode-ai/plugin"
 *
 * export default tool({
 *   description: "One-line description — the LLM uses this to decide whether to call the tool",
 *   args: {
 *     // Use tool.schema (Zod under the hood) to define typed params:
 *     engine: tool.schema
 *       .string()
 *       .describe("LaTeX engine to use")
 *       .optional(),
 *   },
 *   async execute(args, context) {
 *     // args          → typed params from the schema above
 *     // context.directory  → project working directory
 *     // context.sessionID  → current OpenCode session ID
 *     // context.agent      → agent name ("build", "plan", etc.)
 *     // context.abort      → AbortSignal for cancellation
 *     // context.worktree   → git worktree root (if applicable)
 *
 *     // Do the actual work here — full Node.js capabilities.
 *     // Return whatever the LLM should see as the tool result.
 *     return { success: true, message: "done" }
 *   },
 * })
 * ```
 *
 * **The file name (minus `.ts`) IS the tool name.**
 * To override an OpenCode built-in tool, name the file the same (e.g. `bash.ts`).
 *
 * ### Step 2 — Register metadata
 *
 * Add an entry to `BUILTIN_TOOLS` below. This is used by the renderer to
 * look up human-readable metadata for the tool Widget.
 *
 * ### Step 3 — Create the Widget (renderer side)
 *
 * Create `src/renderer/components/modules/chat/tools/<tool-name>-widget.tsx`
 * following the existing Widget pattern. Then register it in the
 * `CUSTOM_TOOL_WIDGETS` map in that directory's `index.tsx`.
 *
 * ### Step 4 — (Optional) Add a permission preset
 *
 * If the tool needs explicit user approval, add a permission entry in
 * prism-next's app-level OpenCode config/settings.
 */

// ─── Tool metadata (used by renderer for Widget display) ────────────

export interface BuiltinToolMeta {
  /** Tool name (matches the file name without .ts extension) */
  name: string;
  /** Human-readable display label */
  label: string;
  /** Short description shown in tool Widget header */
  description: string;
  /** Category for grouping in UI: "compile" | "reference" | "project" | "utility" */
  category: "compile" | "reference" | "project" | "utility";
}

/**
 * Registry of all prism‑next built-in custom tools.
 *
 * Add new tools here as they are created. The renderer uses this list
 * to look up metadata when rendering tool Widgets.
 *
 * Example entry:
 * ```
 * {
 *   name: "prism-compile",
 *   label: "Compile LaTeX",
 *   description: "Compile the current project with the configured LaTeX engine",
 *   category: "compile",
 * },
 * ```
 */
export const BUILTIN_TOOLS: BuiltinToolMeta[] = [
  {
    name: "question",
    label: "Question",
    description: "Ask the user a question and pause until they respond (replaces built-in question tool)",
    category: "utility",
  },
];

// ─── Tool file loading (used by AcpService.syncBuiltinTools) ──────

export interface ToolFile {
  name: string;
  content: string;
}

/**
 * Collect all built-in tool files from the source directory.
 *
 * In development mode, reads directly from `src/main/tools/` on disk.
 * In production (packaged), tools are bundled into the asar archive and
 * read via `app.getAppPath()`.
 *
 * Tool files are identified by the `.ts` extension. Each file's name
 * (without extension) becomes the tool name.
 */
export function getBuiltinToolFiles(): ToolFile[] {
  const toolsDir = app.isPackaged
    ? join(app.getAppPath(), "main", "tools")
    : join(app.getAppPath(), "src", "main", "tools");

  if (!existsSync(toolsDir)) {
    return [];
  }

  const result: ToolFile[] = [];
  try {
    const entries = readdirSync(toolsDir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip the registry file itself and non-TypeScript files
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name === "index.ts") continue;

      const name = entry.name.replace(/\.ts$/, "");
      const filePath = join(toolsDir, entry.name);
      try {
        const content = readFileSync(filePath, "utf-8");
        result.push({ name, content });
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Directory listing failed — return empty
  }
  return result;
}
