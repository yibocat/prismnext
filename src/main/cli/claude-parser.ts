import type { CliParser } from "./types";

/**
 * Parses Claude CLI stream-json NDJSON output.
 * Claude's --output-format=stream-json produces one JSON line per event.
 * The format is structurally identical to ChatStreamMessage — mostly pass-through.
 */
export class ClaudeParser implements CliParser {
  parse(line: string): Record<string, unknown> | null {
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(line);
    } catch {
      return null; // Skip malformed lines
    }

    const type = json.type as string | undefined;
    if (!type) return null;

    // Skip system messages (session initialization metadata)
    if (type === "system") return null;

    // assistant and user (tool_result) messages pass through directly
    if (type === "assistant" || type === "user") {
      return json;
    }

    // result messages — normalize for consistent rendering
    if (type === "result") {
      const subtype = json.subtype as string | undefined;
      const err = json.error as string | undefined;
      const duration = json.duration_ms as number | undefined;
      return {
        type: "result",
        usage: json.usage,
        duration_ms: duration ?? 0,
        result: subtype === "success"
          ? `Completed in ${duration ?? 0}ms`
          : (err || "Unknown error"),
        is_error: !!err,
      } as Record<string, unknown>;
    }

    return null;
  }
}
