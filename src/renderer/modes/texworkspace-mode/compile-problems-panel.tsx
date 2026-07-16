import { useMemo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  Loader2Icon,
  ScrollTextIcon,
} from "lucide-react";
import { useCompileStore } from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { DEFAULT_MANUSCRIPT_DIR } from "@/types/workspace";
import { parseLatexLog, type LatexProblem } from "./parse-latex-log";
import { cn } from "@/lib/utils";

type CompilePanelTab = "problems" | "log";

function resolveProblemFileId(
  file: string | undefined,
  manuscriptDir: string,
  files: ReturnType<typeof useDocumentStore.getState>["files"],
): string | null {
  if (!file) return null;
  const normalized = file.replace(/^\.\//, "");
  const candidates = [
    normalized,
    `${manuscriptDir}/${normalized}`,
    normalized.includes("/") ? normalized : `${manuscriptDir}/${normalized}`,
  ];
  for (const rel of candidates) {
    const match = files.find((f) => f.relativePath === rel || f.relativePath.endsWith(`/${rel}`));
    if (match) return match.id;
  }
  const byName = files.find((f) => f.name === normalized.split("/").pop());
  return byName?.id ?? null;
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
        "hover:bg-accent/60 border border-transparent hover:border-border/40",
        isError ? "text-destructive" : "text-amber-600 dark:text-amber-500",
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
      {isCompiling ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" />
          <p className="text-[length:var(--font-size-12)]">{t("modes.texworkspace.compiling")}</p>
        </div>
      ) : problems.length === 0 ? (
        <p className="text-[length:var(--font-size-12)] text-muted-foreground px-3 py-8 text-center">
          {t("modes.texworkspace.noProblems")}
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
  if (isCompiling) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full py-16 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        <p className="text-[length:var(--font-size-12)]">{t("modes.texworkspace.compiling")}</p>
      </div>
    );
  }

  if (!compileLog.trim()) {
    return (
      <p className="text-[length:var(--font-size-12)] text-muted-foreground px-3 py-8 text-center">
        {t("modes.texworkspace.noCompileLog")}
      </p>
    );
  }

  return (
    <pre className="h-full overflow-auto px-3 py-2 text-[length:var(--font-size-11)] font-mono whitespace-pre-wrap break-words text-muted-foreground">
      {compileLog}
    </pre>
  );
}

/** Replaces the PDF preview slot when compile problems are open from the toolbar. */
export function CompileProblemsPanel() {
  const { t } = useTranslation();
  const isCompiling = useCompileStore((s) => s.isCompiling);
  const compileError = useCompileStore((s) => s.compileError);
  const compileLog = useCompileStore((s) => s.compileLog);
  const files = useDocumentStore((s) => s.files);
  const requestJumpToLine = useDocumentStore((s) => s.requestJumpToLine);
  const setTexworkspaceActiveFile = useRightPanelStore((s) => s.setTexworkspaceActiveFile);
  const manuscriptDir = useWorkspaceConfigStore((s) => s.manuscriptConfig?.dir ?? DEFAULT_MANUSCRIPT_DIR);

  const [activeTab, setActiveTab] = useState<CompilePanelTab>("problems");

  const problems = useMemo(() => {
    const parsed = parseLatexLog(compileLog);
    if (parsed.length > 0) return parsed;
    if (compileError) {
      return [
        {
          id: "summary",
          severity: "error" as const,
          message: compileError,
        },
      ];
    }
    return [];
  }, [compileLog, compileError]);

  const handleSelect = useCallback(
    (problem: LatexProblem) => {
      const fileId = resolveProblemFileId(problem.file, manuscriptDir, files);
      if (fileId) {
        setTexworkspaceActiveFile(fileId);
        if (problem.line) {
          setTimeout(() => requestJumpToLine(fileId, problem.line!), 80);
        }
      }
    },
    [files, manuscriptDir, requestJumpToLine, setTexworkspaceActiveFile],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-[var(--height-right-area-subtoolbar)] shrink-0 items-center gap-2 px-2 border-b border-border/40 select-none">
        <div className="flex items-center rounded-md border border-border/40 p-0.5 gap-px">
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
            <span>{t("modes.texworkspace.problems")}</span>
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
            <span>{t("modes.texworkspace.compileLog")}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {activeTab === "problems" ? (
          <ProblemsList isCompiling={isCompiling} problems={problems} onSelect={handleSelect} />
        ) : (
          <CompileLogView isCompiling={isCompiling} compileLog={compileLog ?? ""} />
        )}
      </div>
    </div>
  );
}
