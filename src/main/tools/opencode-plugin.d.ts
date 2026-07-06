/**
 * Type shim for `@opencode-ai/plugin`.
 *
 * The ACP tool definitions in `src/main/tools/*.ts` import `{ tool }` from this
 * package, but it is NOT a project dependency — these modules are loaded by
 * OpenCode's plugin runtime (not bundled into the Electron main process), which
 * provides `tool` at runtime. esbuild never resolves the import (the files
 * aren't in the bundle graph), so the build passes; `tsc`, however, type-checks
 * every file under `src/main/**` and would otherwise report `TS2307: Cannot
 * find module '@opencode-ai/plugin'` for every tool file.
 *
 * Mirrors the real OpenCode plugin API shape: `tool({ description, args, execute })`
 * with `tool.schema.*` builders that chain `.describe().optional()`. Schema fields
 * are typed loosely (the runtime validates `args` against the schema); `execute`'s
 * args/context are `Record<string, unknown>` so tool bodies can read fields with
 * `args.x` and narrow at runtime. This is permissive by design — the real types
 * live in OpenCode's runtime and tightening here would only invent types we
 * can't verify.
 */
declare module "@opencode-ai/plugin" {
  /** Chainable schema field (string/number/boolean/array). Runtime-validated. */
  interface SchemaField {
    describe(desc: string): this;
    optional(): this;
    enum(values: readonly unknown[]): this;
    default(value: unknown): this;
  }

  interface SchemaNamespace {
    string(): SchemaField;
    number(): SchemaField;
    boolean(): SchemaField;
    array(item?: SchemaField): SchemaField;
    object(shape?: Record<string, SchemaField>): SchemaField;
    enum(values: readonly unknown[]): SchemaField;
  }

  /** Context OpenCode passes to `execute`. Common fields tool bodies read. */
  interface ToolContext {
    abort: AbortSignal;
    directory?: string;
    sessionID?: string;
    sessionId?: string;
    toolCallId?: string;
    tool_call_id?: string;
    callID?: string;
    [key: string]: unknown;
  }

  interface ToolConfig {
    description: string;
    args?: Record<string, SchemaField>;
    execute: (
      args: Record<string, unknown>,
      context: ToolContext,
    ) => unknown | Promise<unknown>;
  }

  export const tool: ((config: ToolConfig) => unknown) & {
    schema: SchemaNamespace;
  };
}
