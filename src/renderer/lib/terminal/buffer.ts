import type { Terminal } from "@xterm/xterm";
import type { TerminalCommandBlock } from "@/types/terminal";

export type { TerminalCommandBlock };

const ANSI_RE = /\x1b\[[0-9;]*[ -/]*[@-~]/g;
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

export function stripTerminalAnsi(text: string): string {
  return text.replace(OSC_RE, "").replace(ANSI_RE, "");
}

function lineText(term: Terminal, index: number): string {
  const line = term.buffer.active.getLine(index);
  if (!line) return "";
  return stripTerminalAnsi(line.translateToString(true)).replace(/\s+$/g, "");
}

/** Visible viewport lines (roughly one screen). */
export function getTerminalViewportText(term: Terminal): string {
  const buf = term.buffer.active;
  const start = buf.viewportY;
  const end = Math.min(buf.length, start + term.rows);
  const lines: string[] = [];
  for (let i = start; i < end; i++) {
    const t = lineText(term, i);
    if (t.length > 0 || i === end - 1) lines.push(t);
  }
  return lines.join("\n").trimEnd();
}

/** Best-effort last command block from scrollback + lastCommand hint. */
export function getLastCommandBlockFromBuffer(
  term: Terminal,
  lastCommand?: string,
): TerminalCommandBlock {
  const buf = term.buffer.active;
  const total = buf.length;
  const searchFrom = Math.max(0, total - 800);

  if (lastCommand?.trim()) {
    const needle = lastCommand.trim();
    for (let i = total - 1; i >= searchFrom; i--) {
      const text = lineText(term, i);
      if (!text.includes(needle)) continue;
      const lines: string[] = [];
      for (let j = i; j < total; j++) {
        lines.push(lineText(term, j));
      }
      const joined = lines.join("\n").trimEnd();
      const output = lines.slice(1).join("\n").trimEnd();
      return {
        command: needle,
        output: output || joined,
      };
    }
  }

  return {
    command: lastCommand?.trim() || undefined,
    output: getTerminalViewportText(term),
  };
}

/** Strip noisy PTY chunks for OSC block capture. */
export function appendTerminalCapture(prev: string, chunk: string): string {
  const cleaned = stripTerminalAnsi(chunk)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  return prev + cleaned;
}
