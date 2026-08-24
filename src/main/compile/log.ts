import type { CompileEngineId } from "./types";

/** First non-empty line, truncated — never dump a TeX log into the app logger. */
export function oneLineError(text: string | undefined, max = 240): string {
  const line = (text ?? "").split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? "";
  if (line.length <= max) return line;
  return `${line.slice(0, Math.max(0, max - 1))}…`;
}

export function tectonicEngineId(bundled: boolean): Exclude<CompileEngineId, "texlive"> {
  return bundled ? "tectonic-bundled" : "tectonic-system";
}

/**
 * Extract readable error messages from a TeX log file.
 */
export function extractErrorLines(log: string): string {
  if (!log) return "";

  const lines = log.split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length && blocks.length < 5) {
    const line = lines[i];
    const isErrorStart =
      line.startsWith("!") ||
      line.includes("Error:") ||
      line.includes("error:");

    if (isErrorStart) {
      const end = Math.min(i + 14, lines.length);
      blocks.push(lines.slice(i, end).join("\n"));
      i = end;
      continue;
    }
    i++;
  }

  if (blocks.length > 0) {
    let result = blocks.join("\n\n");
    result += "\n\n---- Engine output ----\n";
    const tailStart = Math.max(0, lines.length - 20);
    result += lines.slice(tailStart).join("\n");
    return result;
  }

  if (lines.some((l) => l.includes("No pages of output"))) {
    return "No pages of output. Add visible content to the document body.";
  }

  return log.slice(-500);
}
