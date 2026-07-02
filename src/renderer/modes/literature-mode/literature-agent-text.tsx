import { useCallback, useEffect, useMemo, useState } from "react";
import { FileTextIcon, Loader2Icon, MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureExtractStore, selectExtractProgressForPaper } from "@/stores/literature-extract-store";
import { Progress } from "@/components/ui/progress";
import { useSettingsStore } from "@/stores/settings-store";
import { openHiddenProjectFile } from "@/lib/files/open-project-path";
import {
  EXTRACT_MAX_AUTO_RETRIES,
  PAPER_EXTRACT_ACTION_LABEL,
  PAPER_EXTRACT_METADATA_LABEL,
  pickBestReadySource,
} from "../../../shared/paper-extract";
import type { LiteraturePaper, PaperExtractSource } from "@/types/electron.d";
import { paperHasReadablePdf } from "./literature-format";
import { MetadataRow } from "./literature-inline-field";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuSeparator,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { cn } from "@/lib/utils";

const SOURCES: PaperExtractSource[] = ["mineru", "pdfjs", "html"];

const extractActionChipClass =
  "inline-flex h-6 shrink-0 items-center rounded-md border border-transparent px-1.5 text-[length:var(--font-size-13)] transition-colors hover:border-border/55 hover:bg-accent/30";

const extractMenuBtnClass =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border/55 hover:bg-accent/30";

const extractToolbarBtnClass =
  "flex h-6 max-w-[min(11rem,26vw)] shrink-0 items-center gap-1.5 rounded px-2 text-[length:var(--font-menu-item)] transition-colors";

const extractToolbarMenuBtnClass =
  "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

type AgentTextState = "idle" | "busy" | "ready" | "failed" | "unavailable";

function deriveAgentTextState(
  states: ReturnType<typeof useLiteratureExtractStore.getState>["statesByPaper"][string],
  canPrepare: boolean,
): { state: AgentTextState; source: PaperExtractSource | null } {
  if (!canPrepare) return { state: "unavailable", source: null };
  const ready = pickBestReadySource(states, "auto");
  const busy = SOURCES.some((s) => ["queued", "extracting"].includes(states?.[s]?.status ?? ""));
  if (busy) {
    const src = SOURCES.find((s) => ["queued", "extracting"].includes(states?.[s]?.status ?? ""));
    return { state: "busy", source: src ?? null };
  }
  if (ready) return { state: "ready", source: ready };
  if (SOURCES.some((s) => states?.[s]?.status === "failed")) {
    const src = SOURCES.find((s) => states?.[s]?.status === "failed") ?? null;
    return { state: "failed", source: src };
  }
  return { state: "idle", source: null };
}

function sourceShort(source: PaperExtractSource): string {
  if (source === "mineru") return "MinerU";
  if (source === "pdfjs") return "pdfjs";
  return "HTML";
}

export function useLiteratureAgentTextActions(paper: LiteraturePaper) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const settings = useSettingsStore((s) => s.settings);
  const states = useLiteratureExtractStore((s) => s.statesByPaper[paper.id]);
  const enqueue = useLiteratureExtractStore((s) => s.enqueue);
  const retry = useLiteratureExtractStore((s) => s.retry);
  const cancel = useLiteratureExtractStore((s) => s.cancel);
  const [, tick] = useState(0);

  const hasPdf = paperHasReadablePdf(paper);
  const hasHtml = Boolean(paper.doi || paper.arxiv_id);
  const canPrepare = hasPdf || hasHtml;
  const defaultEngine =
    (settings.literatureExtractEngineDefault as PaperExtractSource | undefined) ?? "pdfjs";
  const { state, source } = useMemo(
    () => deriveAgentTextState(states, canPrepare),
    [states, canPrepare],
  );

  useEffect(() => {
    const hasScheduled = SOURCES.some(
      (s) => states?.[s]?.status === "failed" && states[s]?.nextRetryAt,
    );
    if (!hasScheduled) return;
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [states]);

  const handlePrepare = useCallback(async () => {
    if (!projectRoot) return;
    try {
      await enqueue(projectRoot, paper.id, defaultEngine);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Extraction failed");
    }
  }, [defaultEngine, enqueue, paper.id, projectRoot]);

  const handleOpenText = useCallback(async () => {
    if (!projectRoot) return;
    const src = pickBestReadySource(states, "auto");
    if (!src) return;
    const { relativePath } = await window.electronAPI.extractOpenMd(projectRoot, paper.id, src);
    if (!relativePath) {
      toast.error("Text file not found");
      return;
    }
    await openHiddenProjectFile(relativePath);
  }, [paper.id, projectRoot, states]);

  const handleRetry = useCallback(async () => {
    if (!projectRoot || !source) return;
    try {
      await retry(projectRoot, paper.id, source);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    }
  }, [paper.id, projectRoot, retry, source]);

  const handleCancel = useCallback(async () => {
    if (!projectRoot || !source) return;
    await cancel(projectRoot, paper.id, source);
  }, [cancel, paper.id, projectRoot, source]);

  const handleEngine = useCallback(
    async (src: PaperExtractSource, force = false) => {
      if (!projectRoot) return;
      await enqueue(projectRoot, paper.id, src, force);
    },
    [enqueue, paper.id, projectRoot],
  );

  const failedState = source && state === "failed" ? states?.[source] : null;
  const attemptsLeft =
    failedState?.retryCount != null
      ? Math.max(0, EXTRACT_MAX_AUTO_RETRIES - failedState.retryCount)
      : 0;

  return {
    canPrepare,
    hasPdf,
    hasHtml,
    state,
    source,
    defaultEngine,
    failedState,
    attemptsLeft,
    handlePrepare,
    handleOpenText,
    handleRetry,
    handleCancel,
    handleEngine,
  };
}

function ExtractOverflowMenu({
  actions,
  menuBtnClass = extractMenuBtnClass,
}: {
  actions: ReturnType<typeof useLiteratureAgentTextActions>;
  menuBtnClass?: string;
}) {
  const { hasPdf, hasHtml, state, defaultEngine, handleEngine, handleCancel } = actions;

  return (
    <AppMenu>
      <AppMenuTrigger asChild>
        <button type="button" className={menuBtnClass} title="Extract engines">
          <MoreHorizontalIcon className="size-3.5" />
        </button>
      </AppMenuTrigger>
      <AppMenuContent align="end">
        {hasPdf ? (
          <>
            <AppMenuItem onSelect={() => void handleEngine("mineru")}>MinerU (cloud)</AppMenuItem>
            <AppMenuItem onSelect={() => void handleEngine("pdfjs")}>Built-in pdfjs</AppMenuItem>
          </>
        ) : null}
        {hasHtml ? (
          <AppMenuItem onSelect={() => void handleEngine("html")}>HTML snapshot</AppMenuItem>
        ) : null}
        {state === "ready" ? (
          <AppMenuItem onSelect={() => void handleEngine(defaultEngine, true)}>
            Re-extract
          </AppMenuItem>
        ) : null}
        {state === "busy" ? (
          <>
            <AppMenuSeparator />
            <AppMenuItem onSelect={() => void handleCancel()}>Cancel extraction</AppMenuItem>
          </>
        ) : null}
      </AppMenuContent>
    </AppMenu>
  );
}

/** Metadata row — single-line action button + extract overflow menu. */
export function LiteratureAgentTextRow({
  paper,
  actions: actionsProp,
}: {
  paper: LiteraturePaper;
  actions?: ReturnType<typeof useLiteratureAgentTextActions>;
}) {
  const progress = useLiteratureExtractStore((s) =>
    selectExtractProgressForPaper(s.progressByKey, paper.id),
  );
  const fallback = useLiteratureAgentTextActions(paper);
  const actions = actionsProp ?? fallback;
  const {
    canPrepare,
    state,
    source,
    failedState,
    attemptsLeft,
    handlePrepare,
    handleOpenText,
    handleRetry,
  } = actions;

  const zoteroOnly = Boolean(paper.zotero_key && !paper.pdf_path);

  if (!canPrepare || state === "unavailable") return null;

  const valueClass =
    "flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 px-1 -mx-1 text-[length:var(--font-size-13)] leading-relaxed";

  return (
    <MetadataRow label={PAPER_EXTRACT_METADATA_LABEL} className="items-center">
      {state === "busy" ? (
        <div className={cn(valueClass, "text-foreground/85")}>
          <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          <span className="truncate">{progress?.message ?? "Extracting text…"}</span>
          <ExtractOverflowMenu actions={actions} />
        </div>
      ) : state === "ready" && source ? (
        <div className={valueClass}>
          <span className="truncate text-emerald-700 dark:text-emerald-400">
            Text extracted ({sourceShort(source)})
          </span>
          <span className="shrink-0 text-muted-foreground/60">·</span>
          <button
            type="button"
            title="Open extracted Markdown"
            className={cn(extractActionChipClass, "text-emerald-700 dark:text-emerald-400")}
            onClick={() => void handleOpenText()}
          >
            open Markdown
          </button>
          <ExtractOverflowMenu actions={actions} />
        </div>
      ) : state === "failed" ? (
        <div className={valueClass}>
          <span className="truncate text-destructive">
            {failedState?.error ?? "Extraction failed"}
          </span>
          <span className="shrink-0 text-muted-foreground/60">·</span>
          <button
            type="button"
            title={
              failedState?.error ??
              (attemptsLeft > 0 ? "Retry extraction" : "Retry (auto-retry exhausted)")
            }
            className={cn(extractActionChipClass, "text-destructive")}
            onClick={() => void handleRetry()}
          >
            retry
          </button>
          <ExtractOverflowMenu actions={actions} />
        </div>
      ) : state === "idle" ? (
        <div className={valueClass}>
          <span className="truncate text-foreground/85">Not extracted</span>
          <span className="shrink-0 text-muted-foreground/60">·</span>
          <button
            type="button"
            title="Convert PDF to Markdown"
            className={cn(extractActionChipClass, "text-foreground/90")}
            onClick={() => void handlePrepare()}
          >
            {PAPER_EXTRACT_ACTION_LABEL.toLowerCase()}
          </button>
          {zoteroOnly ? (
            <span className="truncate text-muted-foreground/70">(copies PDF from Zotero)</span>
          ) : null}
          <ExtractOverflowMenu actions={actions} />
        </div>
      ) : (
        <p className={cn(valueClass, "text-foreground/85")}>Not extracted</p>
      )}
    </MetadataRow>
  );
}

/** Compact extract control for the literature reader tab toolbar (right edge). */
export function LiteratureReaderExtractToolbar({ paper }: { paper: LiteraturePaper }) {
  const progress = useLiteratureExtractStore((s) =>
    selectExtractProgressForPaper(s.progressByKey, paper.id),
  );
  const actions = useLiteratureAgentTextActions(paper);
  const {
    canPrepare,
    state,
    source,
    failedState,
    attemptsLeft,
    handlePrepare,
    handleOpenText,
    handleRetry,
  } = actions;

  if (!canPrepare || state === "unavailable") return null;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-0.5">
      {state === "busy" ? (
        <>
          <div
            className={cn(extractToolbarBtnClass, "max-w-[min(14rem,34vw)] flex-col items-stretch py-1")}
            title={progress?.message ?? "Extracting text…"}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
              <span className="truncate">{progress?.message ?? "Extracting…"}</span>
            </div>
            {progress?.percent != null ? (
              <Progress
                value={progress.percent}
                className="h-1 [&_[data-slot=progress-indicator]]:transition-none"
              />
            ) : null}
          </div>
          <ExtractOverflowMenu actions={actions} menuBtnClass={extractToolbarMenuBtnClass} />
        </>
      ) : state === "ready" && source ? (
        <>
          <button
            type="button"
            title={`Text extracted (${sourceShort(source)}) — open Markdown`}
            className={cn(
              extractToolbarBtnClass,
              "text-emerald-700 hover:bg-accent dark:text-emerald-400",
            )}
            onClick={() => void handleOpenText()}
          >
            <FileTextIcon className="size-3.5 shrink-0" />
            <span className="truncate">Markdown</span>
          </button>
          <ExtractOverflowMenu actions={actions} menuBtnClass={extractToolbarMenuBtnClass} />
        </>
      ) : state === "failed" ? (
        <>
          <button
            type="button"
            title={
              failedState?.error ??
              (attemptsLeft > 0 ? "Retry extraction" : "Retry (auto-retry exhausted)")
            }
            className={cn(extractToolbarBtnClass, "text-destructive hover:bg-destructive/10")}
            onClick={() => void handleRetry()}
          >
            <span className="truncate">Retry extract</span>
          </button>
          <ExtractOverflowMenu actions={actions} menuBtnClass={extractToolbarMenuBtnClass} />
        </>
      ) : (
        <>
          <button
            type="button"
            title="Convert PDF to Markdown"
            className={cn(
              extractToolbarBtnClass,
              "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            onClick={() => void handlePrepare()}
          >
            <FileTextIcon className="size-3.5 shrink-0" />
            <span className="truncate">{PAPER_EXTRACT_ACTION_LABEL}</span>
          </button>
          <ExtractOverflowMenu actions={actions} menuBtnClass={extractToolbarMenuBtnClass} />
        </>
      )}
    </div>
  );
}
