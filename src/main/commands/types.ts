// prism-next/src/main/commands/types.ts
// Command type definitions — owned by the command engine (main process).
// Renderer imports these as pure types via the @commands alias (erased at compile time).

export type CommandSource = "builtin" | "user";

export interface CommandDef {
  /** Unique ID: "builtin:setup" | "builtin:compile" | "user:review-section" */
  id: string;
  /** Command name WITHOUT / prefix */
  name: string;
  /** Description shown in dropdown and settings */
  description: string;
  /** Which layer this command belongs to */
  source: CommandSource;
  /** Template string. Expanded into the input box. Supports $ARGUMENTS, $1..$N, @path, !`cmd` */
  template: string;
  /** Optional: action key. If set, the template is expanded and shown in the input box,
   *  but when the user presses Enter the action runs locally instead of sending to AI.
   *  The action handler can return a message string to inject into the chat as feedback. */
  action?: string;
  /** Optional agent override (build | plan) */
  agent?: string;
  /** Optional model override (provider/model-id) */
  model?: string;
  /** Sort order (lower = first) */
  order: number;
  /** Toggle state — disabled commands are hidden from / dropdown */
  enabled: boolean;
}

/** Payload for creating a new user command */
export interface CreateCommandPayload {
  name: string;
  description: string;
  template: string;
  action?: string;
  agent?: string;
  model?: string;
}

/** Payload for updating an existing user command */
export interface UpdateCommandPayload {
  name?: string;
  description?: string;
  template?: string;
  /** Set to empty string to clear action */
  action?: string;
  agent?: string;
  model?: string;
}

/** Parsed result from the command parser */
export interface ParsedCommand {
  /** The command name (without /) */
  command: string;
  /** Arguments extracted from user input */
  args: {
    /** Everything after /command — raw tail string */
    ARGUMENTS: string;
    /** Positional args: $1, $2, ... $N (max 9) */
    [key: `$${number}`]: string;
  };
  /** @-prefixed file paths found in args */
  files: string[];
  /** !`...` shell commands found in args */
  shells: string[];
}
