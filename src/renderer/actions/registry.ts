// prism-next/src/renderer/actions/registry.ts
//
// Central registry for action command handlers.
//
// ─── HOW IT WORKS ────────────────────────────────────────────────────
//
//   1. A CommandDef in main/commands/builtin-commands.ts declares an
//      `action` field — this is just a STRING KEY (e.g. "compile-document").
//
//   2. The corresponding handler function is registered HERE via
//      `actionRegistry.register(key, handler)` — actual registration
//      happens in builtin-actions.ts (side-effect imported by ChatComposer).
//
//   3. When the user presses Enter, ChatComposer.handleSend calls
//      `actionRegistry.execute(key)` which looks up the handler and
//      runs it. The return value becomes the result text displayed in
//      the action-status card.
//
//   If a key has no registered handler, execute() throws an Error,
//   which is caught by handleSend and displayed as an error status card.
//
// ─── ADDING A NEW ACTION HANDLER ─────────────────────────────────────
//
//   Step 1: Define the command with an action key in:
//           src/main/commands/builtin-commands.ts
//
//           { ..., name: "my-cmd", action: "my-action-key" }
//
//   Step 2: Register the handler in:
//           src/renderer/actions/builtin-actions.ts
//
//           actionRegistry.register("my-action-key", () => {
//             // Your local logic here.
//             // Can be sync or async.
//             return "Feedback message shown in the action-status card";
//           });
//
//   Step 3: Done. No other files need changes.
//
// ─── FUTURE ───────────────────────────────────────────────────────────
//   User-defined action commands (registering handlers from .md files)
//   is not yet supported. The registry API is ready for it.

export type ActionHandler = () => string | Promise<string>;

class ActionRegistry {
  private handlers = new Map<string, ActionHandler>();

  /**
   * Register an action handler for the given key.
   *
   * The key must match the `action` field in the CommandDef exactly
   * (case-sensitive). Registering a key that already exists logs a
   * warning and overwrites.
   */
  register(key: string, handler: ActionHandler): void {
    if (this.handlers.has(key)) {
      console.warn(`[actions] Overwriting handler for "${key}"`);
    }
    this.handlers.set(key, handler);
  }

  /**
   * Execute an action by key.
   *
   * Returns the feedback message string (or a Promise resolving to one).
   * Throws if no handler is registered for the given key.
   */
  async execute(key: string): Promise<string> {
    const handler = this.handlers.get(key);
    if (!handler) {
      throw new Error(
        `[actions] No handler registered for action "${key}". ` +
        `Register one in src/renderer/actions/builtin-actions.ts.`,
      );
    }
    return handler();
  }

  /** Check if a handler is registered for the given key. */
  has(key: string): boolean {
    return this.handlers.has(key);
  }
}

/** Singleton */
export const actionRegistry = new ActionRegistry();
