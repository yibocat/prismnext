export type LatexProblemSeverity = "error" | "warning";

export interface LatexProblem {
  id: string;
  severity: LatexProblemSeverity;
  message: string;
  file?: string;
  line?: number;
  excerpt?: string;
}

const LINE_REF_RE = /^l\.(\d+)\s*(.*)$/;
const FILE_LINE_RE = /^([^:\s]+\.(?:tex|ltx|sty|cls|bib)):(\d+)(?::\s*(.*))?$/i;
const LATEX_WARNING_RE = /^LaTeX Warning:\s*(.+?)\s+on input line (\d+)\.?$/i;

function pushUnique(problems: LatexProblem[], problem: LatexProblem) {
  const key = `${problem.severity}|${problem.file ?? ""}|${problem.line ?? ""}|${problem.message}`;
  if (problems.some((p) => `${p.severity}|${p.file ?? ""}|${p.line ?? ""}|${p.message}` === key)) {
    return;
  }
  problems.push(problem);
}

export function parseLatexLog(log: string | null | undefined): LatexProblem[] {
  if (!log?.trim()) return [];

  const lines = log.split("\n");
  const problems: LatexProblem[] = [];
  let i = 0;

  while (i < lines.length) {
    const currentLine = lines[i];
    const trimmed = currentLine.trim();

    const warningMatch = trimmed.match(LATEX_WARNING_RE);
    if (warningMatch) {
      pushUnique(problems, {
        id: `w:${i}`,
        severity: "warning",
        message: warningMatch[1].trim(),
        line: Number.parseInt(warningMatch[2], 10),
        excerpt: trimmed,
      });
      i += 1;
      continue;
    }

    const fileLineMatch = trimmed.match(FILE_LINE_RE);
    if (fileLineMatch) {
      pushUnique(problems, {
        id: `e:${i}`,
        severity: "error",
        file: fileLineMatch[1],
        line: Number.parseInt(fileLineMatch[2], 10),
        message: (fileLineMatch[3] ?? trimmed).trim() || trimmed,
        excerpt: trimmed,
      });
      i += 1;
      continue;
    }

    const isErrorStart =
      trimmed.startsWith("!") ||
      /\bError:/i.test(trimmed) ||
      /\berror:/i.test(trimmed);

    if (isErrorStart) {
      const message = trimmed.startsWith("!") ? trimmed.slice(1).trim() || trimmed : trimmed;
      let file: string | undefined;
      let lineNum: number | undefined;
      const excerptLines = [currentLine];

      const end = Math.min(i + 16, lines.length);
      for (let j = i + 1; j < end; j += 1) {
        const next = lines[j].trim();
        if (!next) continue;

        const fileLine = next.match(FILE_LINE_RE);
        if (fileLine) {
          file = fileLine[1];
          lineNum = Number.parseInt(fileLine[2], 10);
          excerptLines.push(lines[j]);
          break;
        }

        const lineRef = next.match(LINE_REF_RE);
        if (lineRef) {
          lineNum = Number.parseInt(lineRef[1], 10);
          excerptLines.push(lines[j]);
          break;
        }

        if (next.startsWith("!")) break;
      }

      pushUnique(problems, {
        id: `e:${i}`,
        severity: "error",
        message,
        file,
        line: lineNum,
        excerpt: excerptLines.join("\n"),
      });

      i = end;
      continue;
    }

    i += 1;
  }

  return problems;
}

/** Whether the last compile left actionable problems (toolbar button visibility). */
export function hasCompileProblems(
  compileError: string | null,
  compileLog: string | null | undefined,
): boolean {
  if (compileError) return true;
  return parseLatexLog(compileLog).some((p) => p.severity === "error");
}
