const ANSI_RE = /\x1b\[[0-9;]*m/g;

export interface TypstLogError {
  file?: string;
  line?: number;
  message: string;
}

export interface ParsedTypstLog {
  errors: TypstLogError[];
  errorSummary: string;
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

/**
 * Parse Typst CLI stderr. Typical:
 *
 * ```
 * error: expected semicolon
 *    ┌─ manuscript/main.typ:12:5
 * ```
 *
 * When nothing structured is found, `errors` is empty and `errorSummary` is the raw stderr.
 */
export function parseTypstLog(stderr: string): ParsedTypstLog {
  const text = stripAnsi(stderr).replace(/\r\n/g, "\n");
  const trimmed = text.trim();
  if (!trimmed) {
    return { errors: [], errorSummary: "" };
  }

  const errors: TypstLogError[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const msgMatch = line.match(/^\s*error:\s*(.+)$/i);
    if (!msgMatch) continue;
    const message = msgMatch[1]!.trim();
    let file: string | undefined;
    let lineNum: number | undefined;
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      const loc = lines[j]!.match(/┌─\s+(.+):(\d+):(\d+)\s*$/);
      if (!loc) continue;
      file = loc[1]!.replace(/^\.\//, "").replace(/\\/g, "/");
      lineNum = Number.parseInt(loc[2]!, 10);
      break;
    }
    errors.push({ file, line: lineNum, message });
    if (errors.length >= 20) break;
  }

  if (errors.length === 0) {
    return { errors: [], errorSummary: trimmed };
  }

  const errorSummary = errors
    .map((e) => {
      if (e.file && e.line != null) return `${e.file}:${e.line}: ${e.message}`;
      return e.message;
    })
    .join("\n");
  return { errors, errorSummary };
}
