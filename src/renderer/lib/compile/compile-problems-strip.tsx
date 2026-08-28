import { useMemo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2Icon,
  ScrollTextIcon,
} from "lucide-react";
import {
  compileArtifactCacheKey,
  type CompileArtifactKey,
  type CompileEngine,
} from "@shared/compile/artifact-key";
import { parseTypstLog } from "@shared/compile/typst-log";
import {
  useCompileStore,
  type CompileDiagnostics,
  type CompileProblemEntry,
} from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { DEFAULT_MANUSCRIPT_DIR } from "@/types/workspace";
import { parseLatexLog, type LatexProblem } from "./parse-latex-log";
import { cn } from "@/lib/utils";

type CompilePanelTab = "problems" | "log";

function toProblem(entry: CompileProblemEntry, index: number): LatexProblem {
  return {
    id: compileProblemListId(entry, index),
    severity: entry.severity ?? "error",
    message: entry.message,
    file: entry.file,
    line: entry.line,
  };
}

/** React list id — always include index; Typst can emit the same file:line:message twice. */
export function compileProblemListId(
  entry: { file?: string; line?: number; message: string },
  index: number,
): string {
  return `${index}:${entry.file ?? ""}:${entry.line ?? ""}:${entry.message}`;
}

export function problemsFromDiagnostics(
  diag: CompileDiagnostics | undefined,
  engine: CompileEngine,
): LatexProblem[] {
  if (!diag) return [];
  if (diag.structuredErrors.length > 0) {
    return diag.structuredErrors.map(toProblem);
  }
  if (!diag.error) return [];
  if (engine === "typst") {
    const fromLog = parseTypstLog(diag.log ?? "").errors.map((e, i) => toProblem({
      file: e.file,
      line: e.line,
      message: e.message,
      severity: "error",
    }, i));
    if (fromLog.length > 0) return fromLog;
  } else {
    const parsed = parseLatexLog(diag.log);
    if (parsed.length > 0) return parsed;
  }
  return [{ id: "summary", severity: "error", message: diag.error }];
}

/** Strip is for problems only — compiling with a clean log must not insert a bar (layout flash). */
export function shouldShowCompileProblemsStrip(problemCount: number): boolean {
  return problemCount > 0;
}

function resolveProblemFile(
  file: string | undefined,
  manuscriptDir: string,
  files: ReturnType<typeof useDocumentStore.getState>["files"],
) {
  if (!file) return null;
  const normalized = file.replace(/^\.\//, "").replace(/\\/g, "/");
  const candidates = [
    normalized,
    `${manuscriptDir}/${normalized}`,
    normalized.includes("/") ? normalized : `${manuscriptDir}/${normalized}`,
  ];
  for (const rel of candidates) {
    const match = files.find((f) => f.relativePath === rel || f.relativePath.endsWith(`/${rel}`));
    if (match) return match;
  }
  return files.find((f) => f.name === normalized.split("/").pop()) ?? null;
}

function ProblemRow({
  problem,
  onSelect,
}: {
  problem: LatexProblem;
  onSelect: (problem: LatexProblem) => void;
}) {
  const isError = problem.severity === "error";
  return (
    <button
      type="button"
      onClick={() => onSelect(problem)}
      className={cn(
        "w-full text-left rounded-md px-3 py-2 transition-colors",
        "hover:bg-accent border border-transparent hover:border-border",
        isError ? "text-destructive" : "text-warning",
      )}
    >
      <div className="flex items-start gap-2">
        {isError ? (
          <AlertCircleIcon className="size-3.5 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangleIcon className="size-3.5 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--font-size-12)] font-medium leading-snug break-words">
            {problem.message}
          </p>
          {(problem.file || problem.line) && (
            <p className="text-[length:var(--font-hint)] text-muted-foreground mt-0.5 font-mono truncate">
              {[problem.file, problem.line ? `:${problem.line}` : ""].filter(Boolean).join("")}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function ProblemsList({
  isCompiling,
  problems,
  onSelect,
}: {
  isCompiling: boolean;
  problems: LatexProblem[];
  onSelect: (problem: LatexProblem) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="h-full overflow-auto p-2 space-y-1">
      {isCompiling && problems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" />
          <p className="text-[length:var(--font-size-12)]">{t("modes.files.compiling")}</p>
        </div>
      ) : problems.length === 0 ? (
        <p className="text-[length:var(--font-size-12)] text-muted-foreground px-3 py-8 text-center">
          {t("modes.files.noProblems")}
        </p>
      ) : (
        problems.map((p) => <ProblemRow key={p.id} problem={p} onSelect={onSelect} />)
      )}
    </div>
  );
}

function CompileLogView({
  isCompiling,
  compileLog,
}: {
  isCompiling: boolean;
  compileLog: string;
}) {
  const { t } = useTranslation();
  if (isCompiling && !compileLog.trim()) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full py-8 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        <p className="text-[length:var(--font-size-12)]">{t("modes.files.compiling")}</p>
      </div>
    );
  }

  if (!compileLog.trim()) {
    return (
      <p className="text-[length:var(--font-size-12)] text-muted-foreground px-3 py-8 text-center">
        {t("modes.files.noCompileLog")}
      </p>
    );
  }

  return (
    <pre className="h-full overflow-auto px-3 py-2 text-[length:var(--font-size-11)] font-mono whitespace-pre-wrap break-words text-muted-foreground">
      {compileLog}
    </pre>
  );
}

/**
 * Collapsible compile problems strip for a Files `.tex` / `.typ` tab.
 * Data is keyed by Compile Artifact Key — not the last global compile.
 */
export function CompileProblemsStrip({ artifactKey }: { artifactKey: CompileArtifactKey }) {
  const { t } = useTranslation();
  const cacheKey = compileArtifactCacheKey(artifactKey);
  const diag = useCompileStore((s) => s.diagnosticsByKey[cacheKey]);
  const compilingKey = useCompileStore((s) => s.compilingKey);
  const isThisCompiling = compilingKey === cacheKey;
  const files = useDocumentStore((s) => s.files);
  const requestJumpToLine = useDocumentStore((s) => s.requestJumpToLine);
  const openFile = useRightPanelStore((s) => s.openFile);
  const manuscriptDir = useWorkspaceConfigStore((s) => s.manuscriptConfig?.dir ?? DEFAULT_MANUSCRIPT_DIR);

  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<CompilePanelTab>("problems");

  const problems = useMemo(
    () => problemsFromDiagnostics(diag, artifactKey.engine),
    [diag, artifactKey.engine],
  );

  const errorCount = problems.filter((p) => p.severity === "error").length;
  const warningCount = problems.filter((p) => p.severity === "warning").length;

  const handleSelect = useCallback(
    (problem: LatexProblem) => {
      const match = resolveProblemFile(problem.file, manuscriptDir, files);
      if (match) {
        openFile(match.id, match.relativePath, match.name, { pin: true });
        if (problem.line) {
          setTimeout(() => requestJumpToLine(match.id, problem.line!), 80);
        }
      }
    },
    [files, manuscriptDir, openFile, requestJumpToLine],
  );

  if (!shouldShowCompileProblemsStrip(problems.length)) return null;

  const summary = [
    errorCount > 0 ? t("modes.files.errorCount", { count: errorCount }) : null,
    warningCount > 0 ? t("modes.files.warningCount", { count: warningCount }) : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="shrink-0 border-t border-border bg-background">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex h-7 w-full items-center gap-1.5 px-2 text-left text-[length:var(--font-size-12)] hover:bg-accent"
        aria-expanded={expanded}
        title={expanded ? t("modes.files.hideProblems") : t("modes.files.showProblems")}
      >
        {isThisCompiling ? (
          <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : errorCount > 0 ? (
          <AlertCircleIcon className="size-3.5 shrink-0 text-destructive" />
        ) : (
          <AlertTriangleIcon className="size-3.5 shrink-0 text-warning" />
        )}
        <span className={cn(
          "min-w-0 flex-1 truncate",
          errorCount > 0 ? "text-destructive" : "text-muted-foreground",
        )}>
          {summary || t("modes.files.compiling")}
        </span>
        {expanded ? (
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronUpIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded ? (
        <div className="flex h-44 flex-col border-t border-border">
          <div className="flex h-[var(--height-right-area-subtoolbar)] shrink-0 items-center gap-2 px-2 border-b border-border select-none">
            <div className="flex items-center rounded-md border border-border p-0.5 gap-px">
              <button
                type="button"
                onClick={() => setActiveTab("problems")}
                className={cn(
                  "flex items-center gap-1.5 h-6 px-2 rounded-sm text-[length:var(--font-size-12)] transition-colors",
                  activeTab === "problems"
                    ? "bg-muted text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <AlertCircleIcon className="size-3.5 shrink-0" />
                <span>{t("modes.files.problems")}</span>
                {problems.length > 0 && (
                  <span className="text-[length:var(--font-hint)] tabular-nums opacity-70">
                    {problems.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("log")}
                className={cn(
                  "flex items-center gap-1.5 h-6 px-2 rounded-sm text-[length:var(--font-size-12)] transition-colors",
                  activeTab === "log"
                    ? "bg-muted text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ScrollTextIcon className="size-3.5 shrink-0" />
                <span>{t("modes.files.compileLog")}</span>
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {activeTab === "problems" ? (
              <ProblemsList isCompiling={isThisCompiling} problems={problems} onSelect={handleSelect} />
            ) : (
              <CompileLogView isCompiling={isThisCompiling} compileLog={diag?.log ?? ""} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
