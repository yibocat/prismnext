/**
 * Inline peek for Interaction cards in chat — figure image or mini plot.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ChartLineIcon, ImageIcon } from "lucide-react";
import { useExperimentStore } from "@/stores/experiment-store";
import { resolveProjectRelativePath } from "@/lib/files/project-path";
import { pickFigureResourcePath, isFigureStaticKind } from "../../../shared/interaction-figure";
import { isInteractionPlotKind, type PlotDataResult } from "../../../shared/interaction-plot";
import type { InteractionSpec } from "../../../shared/interaction-spec";
import {
  artifactBasename,
  chatImagePathCandidates,
} from "../../../shared/artifact-path";
import {
  CHAT_ARTIFACT_INLINE_IMAGE_CLASS,
  CHAT_ARTIFACT_PEEK_BODY_CLASS,
  CHAT_ARTIFACT_THUMB_PREVIEW_CLASS,
} from "@/lib/markdown/chat-artifact";
import { loadInteractionPlotData } from "./plot/load-interaction-plot-data";
import { cn } from "@/lib/utils";

function useElementSize(ref: RefObject<HTMLElement | null>, active: boolean) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !active) return;

    const measure = () => {
      const width = Math.floor(node.clientWidth);
      const height = Math.floor(node.clientHeight);
      if (width < 8 || height < 8) return;
      setSize((prev) =>
        prev && prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [ref, active]);

  return size;
}

/** Fixed-height host for Observable Plot peeks inside interaction cards. */
function PlotPeekFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden border-t border-border-subtle bg-background",
        CHAT_ARTIFACT_THUMB_PREVIEW_CLASS,
        className,
      )}
    >
      {children}
    </div>
  );
}

function FigurePeekPlaceholder({
  loading,
  failed,
}: {
  loading: boolean;
  failed: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center py-6 text-[length:var(--font-size-11)] text-muted-foreground",
        loading ? "animate-pulse" : "",
      )}
    >
      {loading ? (
        t("interaction.card.previewLoading")
      ) : failed ? (
        <span className="flex items-center gap-1.5">
          <ImageIcon className="size-3.5" aria-hidden />
          {t("interaction.card.previewUnavailable")}
        </span>
      ) : null}
    </div>
  );
}

function PeekPlaceholder({
  loading,
  failed,
  kind,
  overlay,
}: {
  loading: boolean;
  failed: boolean;
  kind: string;
  overlay?: boolean;
}) {
  const { t } = useTranslation();
  const Icon = isFigureStaticKind(kind) ? ImageIcon : ChartLineIcon;
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-background",
        overlay ? "absolute inset-0" : "",
        loading ? "animate-pulse" : "",
      )}
    >
      {loading ? (
        <span className="text-[length:var(--font-size-11)] text-muted-foreground">
          {t("interaction.card.previewLoading")}
        </span>
      ) : failed ? (
        <span className="flex items-center gap-1.5 text-[length:var(--font-size-11)] text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
          {t("interaction.card.previewUnavailable")}
        </span>
      ) : null}
    </div>
  );
}

function FigurePeek({ spec, projectRoot }: { spec: InteractionSpec; projectRoot: string }) {
  const rel = pickFigureResourcePath(spec);
  const workspaceHintsKey = useExperimentStore((s) => {
    const hints = new Set<string>();
    const detailWs = s.detail?.meta.workspacePath;
    if (detailWs) hints.add(detailWs);
    for (const e of s.experiments) {
      if (e.workspacePath) hints.add(e.workspacePath);
    }
    return [...hints].join("\n");
  });
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!rel || !projectRoot) {
      setLoading(false);
      setFailed(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setDataUrl(null);

    const workspaceHints = workspaceHintsKey ? workspaceHintsKey.split("\n") : [];
    const candidates = chatImagePathCandidates(rel, workspaceHints);

    const tryRead = async (candidate: string): Promise<string | null> => {
      const abs = resolveProjectRelativePath(projectRoot, candidate);
      if (!abs) return null;
      try {
        if (!(await window.electronAPI.fsExists(abs))) return null;
        const { dataUrl: url } = await window.electronAPI.fsReadImage(abs);
        return url || null;
      } catch {
        return null;
      }
    };

    void (async () => {
      for (const candidate of candidates) {
        if (cancelled) return;
        const url = await tryRead(candidate);
        if (url) {
          if (!cancelled) {
            setDataUrl(url);
            setLoading(false);
          }
          return;
        }
      }
      const base = artifactBasename(rel);
      if (base && !cancelled) {
        try {
          const found = await window.electronAPI.fsFindByBasename(projectRoot, base);
          if (found && !cancelled) {
            const url = await tryRead(found);
            if (url && !cancelled) {
              setDataUrl(url);
              setLoading(false);
              return;
            }
          }
        } catch {
          // fall through
        }
      }
      if (!cancelled) {
        setFailed(true);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rel, projectRoot, workspaceHintsKey]);

  return (
    <div className={CHAT_ARTIFACT_PEEK_BODY_CLASS}>
      {loading || failed || !dataUrl ? (
        <FigurePeekPlaceholder loading={loading} failed={failed} />
      ) : (
        <img
          src={dataUrl}
          alt={spec.title}
          className={CHAT_ARTIFACT_INLINE_IMAGE_CLASS}
          loading="lazy"
        />
      )}
    </div>
  );
}

function PlotPeek({ spec, projectRoot }: { spec: InteractionSpec; projectRoot: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const plotHostRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<PlotDataResult | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [failed, setFailed] = useState(false);
  const size = useElementSize(frameRef, !loadingData && !!data?.ok);

  useEffect(() => {
    let cancelled = false;
    setLoadingData(true);
    setFailed(false);
    setData(null);

    void loadInteractionPlotData(spec, projectRoot).then((res) => {
      if (cancelled) return;
      setData(res);
      if (!res.ok) setFailed(true);
      setLoadingData(false);
    });

    return () => {
      cancelled = true;
    };
  }, [spec, projectRoot]);

  useEffect(() => {
    if (!data?.ok || !size || !plotHostRef.current) return;

    let plotEl: Element | undefined;
    let cancelled = false;
    const node = plotHostRef.current;
    const { width, height } = size;

    void (async () => {
      const Plot = await import("@observablehq/plot");
      if (cancelled || !plotHostRef.current) return;

      const isScatter = spec.kind === "plot.scatter";
      const mark = isScatter
        ? Plot.dot(data.points, {
            x: "x",
            y: "y",
            fill: "series",
            r: 2,
            fillOpacity: 0.85,
          })
        : Plot.line(data.points, {
            x: "x",
            y: "y",
            stroke: "series",
            strokeWidth: 1.75,
          });

      const plot = Plot.plot({
        width,
        height,
        marginLeft: Math.min(44, Math.max(28, Math.round(width * 0.12))),
        marginBottom: Math.min(36, Math.max(22, Math.round(height * 0.22))),
        marginTop: 6,
        marginRight: 6,
        x: { label: null, grid: true },
        y: { label: null, grid: true },
        color: { legend: false },
        marks: [mark],
        style: {
          background: "transparent",
          color: "var(--foreground)",
          fontFamily: "var(--font-sans)",
          fontSize: "9px",
          overflow: "visible",
        },
      });

      plotEl = plot;
      node.replaceChildren(plot);
    })();

    return () => {
      cancelled = true;
      plotEl?.remove();
    };
  }, [data, size, spec.kind]);

  const showPlaceholder = loadingData || failed || !data?.ok;

  return (
    <PlotPeekFrame>
      <div ref={frameRef} className="box-border h-full w-full p-1.5">
        <div ref={plotHostRef} className="h-full w-full" />
      </div>
      {showPlaceholder ? (
        <PeekPlaceholder
          loading={loadingData}
          failed={failed || !data?.ok}
          kind={spec.kind}
          overlay
        />
      ) : null}
    </PlotPeekFrame>
  );
}

export function InteractionChatThumbnail({
  spec,
  projectRoot,
}: {
  spec: InteractionSpec;
  projectRoot: string;
}) {
  if (isFigureStaticKind(spec.kind)) {
    return <FigurePeek spec={spec} projectRoot={projectRoot} />;
  }
  if (isInteractionPlotKind(spec.kind)) {
    return <PlotPeek spec={spec} projectRoot={projectRoot} />;
  }
  return (
    <PlotPeekFrame>
      <PeekPlaceholder loading={false} failed kind={spec.kind} />
    </PlotPeekFrame>
  );
}
