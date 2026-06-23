/** Tracks keystrokes the user sends to the PTY (not echoed prompt text). */
export interface TerminalInputLineState {
  line: string;
}

export interface TerminalInputApplyResult {
  state: TerminalInputLineState;
  /** Non-empty command submitted on Enter. */
  submitted?: string;
}

function skipEscapeSequence(data: string, start: number): number {
  if (data[start] !== "\x1b" || start + 1 >= data.length) return start;

  const next = data[start + 1];
  if (next === "[") {
    let i = start + 2;
    while (i < data.length) {
      const ch = data[i];
      if ((ch >= "@" && ch <= "~") || ch === "\x07") return i;
      i++;
    }
    return data.length - 1;
  }

  if (next === "O" && start + 2 < data.length) {
    return start + 2;
  }

  return start + 1;
}

/** Apply raw xterm onData payload to the current input line. */
export function applyTerminalInput(
  data: string,
  prev: TerminalInputLineState = { line: "" },
): TerminalInputApplyResult {
  let line = prev.line;
  let submitted: string | undefined;

  for (let i = 0; i < data.length; i++) {
    const ch = data[i];

    if (ch === "\r" || ch === "\n") {
      const trimmed = line.trim();
      if (trimmed) submitted = trimmed;
      line = "";
      continue;
    }

    if (ch === "\x03" || ch === "\x15") {
      // Ctrl+C / Ctrl+U
      line = "";
      continue;
    }

    if (ch === "\x7f" || ch === "\b") {
      line = line.slice(0, -1);
      continue;
    }

    if (ch === "\x1b") {
      i = skipEscapeSequence(data, i);
      continue;
    }

    if (ch < " " && ch !== "\t") {
      continue;
    }

    line += ch;
  }

  return { state: { line }, submitted };
}
