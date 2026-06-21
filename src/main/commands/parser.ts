// prism-next/src/main/commands/parser.ts
import type { ParsedCommand } from "./types";

/**
 * Parse a slash-command input string into structured form.
 *
 * Example:
 *   /review-section abstract "some text" @figures/fig1.tex !`git log -5`
 *   → {
 *       command: "review-section",
 *       args: { ARGUMENTS: 'abstract "some text" @figures/fig1.tex !`git log -5`',
 *               $1: "abstract", $2: "some text", $3: "@figures/fig1.tex",
 *               $4: "!`git log -5`" },
 *       files: ["figures/fig1.tex"],
 *       shells: ["git log -5"]
 *     }
 *
 * Returns null if the input does not start with "/".
 */
export function parseCommand(input: string): ParsedCommand | null {
  if (!input.startsWith("/")) return null;

  const trimmed = input.slice(1); // remove leading '/'

  // Find the command name: first word after /
  const firstSpace = trimmed.search(/\s/);
  const command = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
  if (!command) return null;

  // Everything after the command name is ARGUMENTS
  const rawArgs = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();

  // Split into tokens respecting double-quote grouping
  const tokens = splitArgs(rawArgs);

  // Build $1..$N positional args (max 9)
  const args: ParsedCommand["args"] = { ARGUMENTS: rawArgs };
  for (let i = 0; i < Math.min(tokens.length, 9); i++) {
    args[`$${i + 1}`] = tokens[i];
  }

  // Extract @file references and !`cmd` shells
  const files: string[] = [];
  const shells: string[] = [];

  for (const token of tokens) {
    if (token.startsWith("@") && token.length > 1) {
      files.push(token.slice(1)); // strip @
    }
    const shellMatch = token.match(/^!`(.+)`$/);
    if (shellMatch) {
      shells.push(shellMatch[1]);
    }
  }

  return { command, args, files, shells };
}

/**
 * Split a string by spaces, respecting double-quote groups.
 *   'hello "world of" code' → ['hello', 'world of', 'code']
 */
function splitArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === " " && !inQuote) {
      if (current) { tokens.push(current); current = ""; }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);

  return tokens;
}
