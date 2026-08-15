// prism-next/src/main/commands/index.ts
import { parseCommand } from "./parser";
import { expandTemplate } from "./expander";
import { getCommandRegistry } from "./registry";

/**
 * CommandEngine — single entry point.
 *
 * Every command works the same way:
 *   1. Parse /command args
 *   2. Look up the command definition (per-project registry, resolver-backed)
 *   3. Expand its template with the args
 *   4. Return the expanded text → goes into the composer input box
 *
 * The user reviews, edits if needed, and presses Enter to send to AI.
 */
export class CommandEngine {
  private static instance: CommandEngine;

  static getInstance(): CommandEngine {
    if (!CommandEngine.instance) {
      CommandEngine.instance = new CommandEngine();
    }
    return CommandEngine.instance;
  }

  /** Expand a slash command. Returns the expanded text, or null if unrecognized. */
  execute(input: string, projectRoot: string): string | null {
    const parsed = parseCommand(input);
    if (!parsed) return null;

    const cmd = getCommandRegistry(projectRoot).lookup(parsed.command);
    if (!cmd) return null;

    return expandTemplate(cmd.template, parsed, projectRoot);
  }

  list(projectRoot: string) {
    return getCommandRegistry(projectRoot).list();
  }

  search(projectRoot: string, query: string) {
    return getCommandRegistry(projectRoot).search(query);
  }

  reload(projectRoot: string) {
    return getCommandRegistry(projectRoot).reload();
  }
}
