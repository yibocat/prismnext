import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import type { InteractionSpec } from "../../../../shared/interaction-spec";
import { normalizeFigureResourceProjectPath } from "../../../../shared/interaction-figure";
import { initialBindingValues, parseMathBindings } from "../../../../shared/interaction-math";
import {
  SCRIPT_MAX_BYTES,
  SCRIPT_RESOURCES_MAX_BYTES,
  buildScriptSandboxHtml,
  classifyResourceEmbedKind,
  scriptResourcePath,
  type ScriptResourceEmbed,
} from "../../../../shared/interaction-script";
import { resolveIsDark } from "../plotly/interaction-plotly-view";
// Raw text is inlined into the sandboxed HTML document as-is (classic
// <script>) — this component is itself lazy-loaded by the renderer
// registry, so the ~3.5MB bundle text is only fetched when a figure.script
// artifact is actually opened.
import plotlyRawText from "plotly.js-dist-min/plotly.min.js?raw";

/** Same timeout convention as figure.static's HTML mode (interaction-figure-view.tsx). */
const SCRIPT_LOAD_TIMEOUT_MS = 10_000;

function resolveProjectAbsPath(projectRoot: string, relPath: string): string {
  const p = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (p.startsWith("/") || /^[A-Za-z]:[/\\]/.test(p)) return p;
  return `${projectRoot.replace(/\/$/, "")}/${p}`;
}

function ScriptError({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-muted px-4 py-5 text-center">
      <p className="text-[length:var(--font-size-13)] text-foreground">
        {t("interaction.panel.scriptErrorTitle")}
      </p>
      <p className="mt-1 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

/** Any declared resources[] entry other than the script itself. */
async function loadResourceEmbeds(
  projectRoot: string,
  spec: InteractionSpec,
): Promise<ScriptResourceEmbed[]> {
  const entries = (spec.resources ?? []).filter((r) => r.role !== "script");
  let totalBytes = 0;
  const out: ScriptResourceEmbed[] = [];
  for (const r of entries) {
    const rawPath = (r.path ?? r.artifactPath)?.trim();
    if (!rawPath) continue;
    const role = r.role ?? rawPath;
    const abs = resolveProjectAbsPath(projectRoot, normalizeFigureResourceProjectPath(spec, rawPath));
    const stat = await window.electronAPI.fsStat(abs).catch(() => null);
    if (stat?.isFile) totalBytes += stat.size;
    if (totalBytes > SCRIPT_RESOURCES_MAX_BYTES) {
      throw new Error(
        `figure.script resources too large combined (> ${SCRIPT_RESOURCES_MAX_BYTES} bytes limit)`,
      );
    }
    const kind = classifyResourceEmbedKind(rawPath);
    if (kind === "image") {
      const img = await window.electronAPI.fsReadImage(abs);
      if (img.dataUrl) out.push({ role, dataUrl: img.dataUrl });
      continue;
    }
    const res = await window.electronAPI.fsRead(abs);
    const text = typeof res.content === "string" ? res.content : "";
    if (kind === "json") {
      try {
        out.push({ role, json: JSON.parse(text), text });
        continue;
      } catch {
        // fall through to text-only
      }
    }
    out.push({ role, text });
  }
  return out;
}

export function InteractionScriptView({
  spec,
  projectRoot,
}: {
  spec: InteractionSpec;
  projectRoot: string;
}) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolveIsDark(resolvedTheme);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Assemble the sandbox HTML: read script.js + declared resources + (only
  // when model.three is set) THREE's ESM bundle, then build one Blob URL.
  useEffect(() => {
    let cancelled = false;
    setBlobUrl(null);
    setError(null);
    setStatus(null);

    const rawScriptPath = scriptResourcePath(spec.resources);
    if (!rawScriptPath) {
      setError("figure.script requires resources[] with a script path");
      return;
    }

    void (async () => {
      try {
        const scriptAbs = resolveProjectAbsPath(
          projectRoot,
          normalizeFigureResourceProjectPath(spec, rawScriptPath),
        );
        const scriptStat = await window.electronAPI.fsStat(scriptAbs).catch(() => null);
        if (scriptStat?.isFile && scriptStat.size > SCRIPT_MAX_BYTES) {
          throw new Error(
            `script.js too large (${scriptStat.size} > ${SCRIPT_MAX_BYTES} bytes limit): ${rawScriptPath}`,
          );
        }
        const scriptRes = await window.electronAPI.fsRead(scriptAbs);
        const scriptText = typeof scriptRes.content === "string" ? scriptRes.content : "";
        if (!scriptText.trim()) {
          throw new Error(`could not read "${rawScriptPath}"`);
        }

        const resources = await loadResourceEmbeds(projectRoot, spec);

        let threeModuleJs: string | undefined;
        if (spec.model?.three === true) {
          const mod = (await import("three?raw")) as { default: string };
          threeModuleJs = mod.default;
        }

        const bindings = initialBindingValues(parseMathBindings(spec.bindings));
        const rect = containerRef.current?.getBoundingClientRect();
        const size = {
          width: Math.max(1, Math.round(rect?.width ?? 480)),
          height: Math.max(1, Math.round(rect?.height ?? 360)),
        };

        const html = buildScriptSandboxHtml({
          plotlyJs: plotlyRawText,
          threeModuleJs,
          scriptText,
          resources,
          bindings,
          size,
          theme: { isDark },
        });
        if (cancelled) return;
        setBlobUrl(URL.createObjectURL(new Blob([html], { type: "text/html" })));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "could not build figure.script sandbox");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, projectRoot, isDark]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // Self-check: listen for the sandbox's postMessage report, timing out if
  // neither a ready nor an error message ever arrives.
  useEffect(() => {
    if (!blobUrl) return;
    let timeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      const message = `figure.script timed out mounting (>${SCRIPT_LOAD_TIMEOUT_MS / 1000}s)`;
      setError(message);
      void window.electronAPI?.interactionReportSceneError?.({
        projectRoot,
        id: spec.id,
        error: message,
        phase: "mount",
      });
    }, SCRIPT_LOAD_TIMEOUT_MS);

    function clearPendingTimeout() {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    }

    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: string; message?: string | null } | undefined;
      if (!data?.type) return;
      if (data.type === "prism-script-ready") {
        clearPendingTimeout();
        setError(null);
        void window.electronAPI?.interactionReportSceneError?.({
          projectRoot,
          id: spec.id,
          error: null,
        });
      } else if (data.type === "prism-script-error") {
        clearPendingTimeout();
        const message = data.message || "figure.script render failed";
        setError(message);
        void window.electronAPI?.interactionReportSceneError?.({
          projectRoot,
          id: spec.id,
          error: message,
          phase: "mount",
        });
      } else if (data.type === "prism-script-status") {
        setStatus(data.message ?? null);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      clearPendingTimeout();
    };
  }, [blobUrl, projectRoot, spec.id]);

  if (error) return <ScriptError message={error} />;

  return (
    <div ref={containerRef} className="flex h-full min-h-[280px] w-full flex-col gap-1">
      {blobUrl ? (
        <iframe
          ref={iframeRef}
          title={spec.title}
          src={blobUrl}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          loading="lazy"
          className="min-h-0 flex-1 w-full rounded-md border border-border bg-card"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
          {t("interaction.card.loading")}
        </div>
      )}
      {status ? (
        <p className="shrink-0 font-mono text-[length:var(--font-size-10)] text-muted-foreground">
          {status}
        </p>
      ) : null}
    </div>
  );
}
