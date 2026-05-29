import type { CliParser } from "./types";

interface AccumBlock {
  type: string;
  id?: string;
  name?: string;
  text?: string;
  thinking?: string;
  input?: Record<string, unknown>;
  _partialJson?: string;
}

/**
 * Parses Claude CLI stream-json NDJSON output.
 *
 * With --include-partial-messages, Claude wraps Anthropic API streaming
 * events inside `stream_event` envelopes. This parser unwraps them and
 * accumulates incremental deltas, emitting progressive `assistant`
 * messages so the frontend can render character-by-character.
 */
export class ClaudeParser implements CliParser {
  private blocks: AccumBlock[] = [];
  private sessionId: string | null = null;

  parse(line: string): Record<string, unknown> | null {
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(line);
    } catch {
      return null;
    }

    const type = json.type as string | undefined;
    if (!type) return null;

    // ── stream_event — unwrap inner Anthropic API event ──
    // {"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}}
    if (type === "stream_event") {
      const inner = json.event as Record<string, unknown> | undefined;
      if (!inner) return null;
      const innerType = inner.type as string | undefined;
      if (!innerType) return null;

      if (innerType === "message_start") {
        this.resetMessage();
        return null;
      }
      if (
        innerType === "content_block_start" ||
        innerType === "content_block_delta" ||
        innerType === "content_block_stop"
      ) {
        return this.processDelta(inner);
      }
      // message_delta / message_stop — no content to accumulate
      return null;
    }

    // ── System — skip but capture session_id ──
    if (type === "system") {
      if (json.session_id) this.sessionId = json.session_id as string;
      return null;
    }

    // ── Top-level delta events (non-wrapped path, defensive) ──
    if (type === "message_start") {
      this.resetMessage();
      return null;
    }
    if (
      type === "content_block_start" ||
      type === "content_block_delta" ||
      type === "content_block_stop"
    ) {
      return this.processDelta(json);
    }

    // ── Full assistant message (final) — reset accumulation ──
    if (type === "assistant") {
      this.resetMessage();
      if (this.sessionId && !json.session_id) {
        json.session_id = this.sessionId;
      }
      return json;
    }

    // ── User message (tool_result) — pass through ──
    if (type === "user") {
      if (this.sessionId && !json.session_id) {
        json.session_id = this.sessionId;
      }
      return json;
    }

    // ── Result — normalize + reset ──
    if (type === "result") {
      this.resetMessage();
      const subtype = json.subtype as string | undefined;
      const err = json.error as string | undefined;
      const duration = json.duration_ms as number | undefined;
      return {
        type: "result",
        session_id: json.session_id || this.sessionId,
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

  /** Process a content_block_start / delta / stop event. */
  private processDelta(
    json: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const type = json.type as string;

    if (type === "content_block_start") {
      const index = json.index as number;
      const block = json.content_block as Record<string, unknown> | undefined;
      if (!block) return null;

      const acc: AccumBlock = { type: block.type as string };
      if (block.id) acc.id = block.id as string;
      if (block.name) acc.name = block.name as string;

      if (acc.type === "text") {
        acc.text = (block.text as string) || "";
      } else if (acc.type === "thinking") {
        acc.thinking = (block.thinking as string) || "";
      } else if (acc.type === "tool_use") {
        acc.input = {};
        acc._partialJson = "";
      }

      while (this.blocks.length <= index) this.blocks.push({ type: "_empty" });
      this.blocks[index] = acc;
      return this.emitAssistant();
    }

    if (type === "content_block_delta") {
      const index = json.index as number;
      const delta = json.delta as Record<string, unknown> | undefined;
      if (delta === undefined || index >= this.blocks.length) return null;

      const block = this.blocks[index];
      if (delta.type === "text_delta") {
        block.text = (block.text || "") + ((delta.text as string) || "");
      } else if (delta.type === "thinking_delta") {
        block.thinking = (block.thinking || "") + ((delta.thinking as string) || "");
      } else if (delta.type === "input_json_delta") {
        block._partialJson = (block._partialJson || "") + ((delta.partial_json as string) || "");
      }
      return this.emitAssistant();
    }

    if (type === "content_block_stop") {
      const index = json.index as number;
      if (index < this.blocks.length) {
        const block = this.blocks[index];
        if (block._partialJson) {
          try { block.input = JSON.parse(block._partialJson); } catch { /* keep raw */ }
          delete block._partialJson;
        }
      }
      return this.emitAssistant();
    }

    return null;
  }

  /** Build an assistant message from all accumulated blocks so far. */
  private emitAssistant(): Record<string, unknown> | null {
    const content = this.blocks
      .filter((b) => b.type !== "_empty")
      .map((b) => {
        const block: Record<string, unknown> = { type: b.type };
        if (b.id) block.id = b.id;
        if (b.name) block.name = b.name;
        if (b.text !== undefined) block.text = b.text;
        if (b.thinking !== undefined) block.thinking = b.thinking;
        if (b.input !== undefined) block.input = b.input;
        return block;
      });

    if (content.length === 0) return null;
    // Don't emit if all blocks are empty — prevents hiding the
    // StreamingIndicator before any real content arrives
    if (content.every((b: any) => !b.text && !b.thinking && !b.input)) return null;

    const msg: Record<string, unknown> = {
      type: "assistant",
      message: { content },
    };
    if (this.sessionId) msg.session_id = this.sessionId;
    return msg;
  }

  private resetMessage(): void {
    this.blocks = [];
  }

  /** Full reset between prompts / after cancel. */
  reset(): void {
    this.resetMessage();
    this.sessionId = null;
  }
}
