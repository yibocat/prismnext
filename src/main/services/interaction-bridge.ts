/**
 * Polls the interaction file bridge for OpenCode custom tool requests.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createLogger } from "./logger";
import { getInteractionBridgeRoot } from "./prism-bridge-paths";
import { getSessionProjectRoot } from "./chat-session-registry";
import {
  listInteractionSummaries,
  readInteractionLastError,
  readInteractionSpec,
  upsertInteractionSpec,
} from "./interaction-store";
import { validateInteractionForWrite } from "./interaction-validate";
import {
  interactionFenceHint,
  isDeprecatedInteractionKind,
  diagnoseInteractionSpecParse,
  normalizeInteractionSpecForWrite,
  parseInteractionSpec,
  type InteractionSpec,
} from "../../shared/interaction-spec";
import {
  isInteractionPlotlyKind,
  PLOTLY_SAMPLE_FIGURE,
  PLOTLY_SAMPLE_FIGURE_MODEL,
} from "../../shared/interaction-plotly";
import {
  isInteractionInstrumentKind,
  INSTRUMENT_SAMPLE_MODEL,
} from "../../shared/interaction-instrument";
import {
  isInteractionScriptKind,
  SCRIPT_SAMPLE_SPEC,
} from "../../shared/interaction-script";
import {
  isInteractionDiagramKind,
  DIAGRAM_SAMPLE_MERMAID_SPEC,
} from "../../shared/interaction-diagram";
import { broadcastInteractionChanged } from "./interaction-ui-events";
import { scheduleInteractionThumbnail } from "./interaction-thumbnail";

const log = createLogger("interaction-bridge", "agent");

type InteractionBridgeRequest = {
  action: "list" | "read" | "write" | "open";
  sessionId?: string;
  projectRoot?: string;
  id?: string;
  kindPrefix?: string;
  spec?: InteractionSpec;
  /** Deprecated — rejected for every current kind, kept only so stray legacy calls get a clear error. */
  sceneSource?: string;
  focus?: boolean;
};

type InteractionDiagnostic = {
  code: string;
  phase: "parse" | "validate";
  fieldPath: string;
  message: string;
};

function envelopeDiagnostic(raw: unknown, message: string): InteractionDiagnostic {
  const spec = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const fieldPath =
    typeof spec.id !== "string" || !spec.id.trim() ? "id"
      : typeof spec.title !== "string" || !spec.title.trim() ? "title"
        : typeof spec.kind !== "string" || !spec.kind.trim() ? "kind"
          : spec.compute !== "local" && spec.compute !== "bound" ? "compute"
            : typeof spec.revision !== "number" ? "revision"
              : "spec";
  return { code: "invalid_spec", phase: "parse", fieldPath, message };
}

function validationDiagnostic(message: string, fieldPath = "model"): InteractionDiagnostic {
  return { code: "invalid_interaction_model", phase: "validate", fieldPath, message };
}

function bridgeRoot(): string {
  return getInteractionBridgeRoot();
}

function resolveProjectRoot(req: InteractionBridgeRequest): string {
  const fromSession = req.sessionId ? getSessionProjectRoot(req.sessionId) : undefined;
  return (fromSession || req.projectRoot?.trim() || "").replace(/\\/g, "/");
}

function specResponse(projectRoot: string, spec: InteractionSpec) {
  const hint = interactionFenceHint(spec.id, spec.title);
  const lastError = readInteractionLastError(projectRoot, spec.id);
  return {
    ok: true,
    spec,
    relativePath: `.prismnext/artifacts/${spec.id}/spec.json`,
    fenceMarkdown: hint.fenceMarkdown,
    replyRule: hint.replyRule,
    ...(lastError
      ? {
          lastError,
          lastErrorHint:
            "Panel self-check failed previously. Fix the artifact via interaction-write, then re-open.",
        }
      : {}),
  };
}

function dispatch(req: InteractionBridgeRequest): Record<string, unknown> {
  const projectRoot = resolveProjectRoot(req);
  if (!projectRoot) {
    return {
      ok: false,
      error: "Project root unknown for this chat session.",
      hint: "Open a project in prismnext and start a new chat tab from that project.",
    };
  }

  switch (req.action) {
    case "list": {
      const items = listInteractionSummaries(projectRoot, req.kindPrefix);
      return { ok: true, items, count: items.length };
    }
    case "read": {
      const id = typeof req.id === "string" ? req.id.trim() : "";
      if (!id) return { ok: false, error: "missing_id" };
      const { spec, error } = readInteractionSpec(projectRoot, id);
      if (!spec) return { ok: false, error: error ?? "not_found", id };
      return specResponse(projectRoot, spec);
    }
    case "write": {
      const raw = normalizeInteractionSpecForWrite(req.spec);
      const parsed = parseInteractionSpec(raw);
      if (!parsed) {
        const error = diagnoseInteractionSpecParse(raw) ?? "invalid InteractionSpec";
        return {
          ok: false,
          error,
          diagnostic: envelopeDiagnostic(raw, error),
          sampleEnvelope: {
            id: "demo.example",
            title: "Example",
            kind: "figure.plotly",
            compute: "local",
            revision: 1,
            model: PLOTLY_SAMPLE_FIGURE_MODEL,
          },
        };
      }

      if (isDeprecatedInteractionKind(parsed.kind)) {
        return {
          ok: false,
          error:
            `kind "${parsed.kind}" is retired and no longer accepts writes — ` +
            "use figure.plotly (2D/3D Plotly JSON) or instrument (live recompute / step iteration) instead.",
          sample: PLOTLY_SAMPLE_FIGURE,
        };
      }

      const sceneSource =
        typeof req.sceneSource === "string" ? req.sceneSource : undefined;

      if (sceneSource != null && isInteractionInstrumentKind(parsed.kind)) {
        return {
          ok: false,
          error: "instrument does not use sceneSource. Put the figure template in spec.model.figureTemplate.",
          sample: INSTRUMENT_SAMPLE_MODEL,
        };
      }
      if (sceneSource != null && isInteractionPlotlyKind(parsed.kind)) {
        return {
          ok: false,
          error: "figure.plotly does not use sceneSource. Put Plotly JSON in spec.model.figure.",
          sample: PLOTLY_SAMPLE_FIGURE_MODEL,
        };
      }
      if (sceneSource != null && isInteractionScriptKind(parsed.kind)) {
        return {
          ok: false,
          error: 'figure.script does not use sceneSource. Write the script to resources: [{ role: "script", path: "script.js" }] instead.',
          sample: SCRIPT_SAMPLE_SPEC,
        };
      }
      if (sceneSource != null && isInteractionDiagramKind(parsed.kind)) {
        return {
          ok: false,
          error: "diagram.mermaid does not use sceneSource. Put Mermaid/DOT text in spec.model.source.",
          sample: DIAGRAM_SAMPLE_MERMAID_SPEC,
        };
      }

      const validation = validateInteractionForWrite(projectRoot, parsed);
      if (!validation.ok) {
        const sample =
          isInteractionInstrumentKind(parsed.kind) ? INSTRUMENT_SAMPLE_MODEL :
            isInteractionPlotlyKind(parsed.kind) ? PLOTLY_SAMPLE_FIGURE_MODEL :
              isInteractionScriptKind(parsed.kind) ? SCRIPT_SAMPLE_SPEC :
                isInteractionDiagramKind(parsed.kind) ? DIAGRAM_SAMPLE_MERMAID_SPEC :
                  undefined;
        return {
          ok: false,
          error: validation.error,
          phase: "compile-preview",
          diagnostic: validationDiagnostic(
            validation.error,
            isInteractionPlotlyKind(parsed.kind) && validation.error.includes("not found on disk")
              ? "resources"
              : "model",
          ),
          ...(sample ? { sample } : {}),
        };
      }

      const result = upsertInteractionSpec(projectRoot, parsed);
      if (!result.ok || !result.spec) {
        return { ok: false, error: result.error ?? "write_failed" };
      }
      const body = {
        ...specResponse(projectRoot, result.spec),
        created: result.created === true,
      };
      broadcastInteractionChanged({
        projectRoot,
        id: result.spec.id,
        title: result.spec.title,
        reason: "write",
        focus: true,
      });
      // Fire-and-forget (V4-B) — background offscreen render + thumbnail,
      // never blocks the Agent's write response. scheduleInteractionThumbnail
      // swallows its own errors into .last-error.json (phase: "thumbnail").
      if (
        isInteractionPlotlyKind(result.spec.kind) ||
        isInteractionInstrumentKind(result.spec.kind) ||
        isInteractionScriptKind(result.spec.kind) ||
        isInteractionDiagramKind(result.spec.kind)
      ) {
        void scheduleInteractionThumbnail(projectRoot, result.spec);
      }
      return body;
    }
    case "open": {
      const id = typeof req.id === "string" ? req.id.trim() : "";
      if (!id) return { ok: false, error: "missing_id" };
      const { spec, error } = readInteractionSpec(projectRoot, id);
      if (!spec) return { ok: false, error: error ?? "not_found", id };
      broadcastInteractionChanged({
        projectRoot,
        id: spec.id,
        title: spec.title,
        reason: "open",
        focus: req.focus !== false,
      });
      return {
        ok: true,
        id: spec.id,
        title: spec.title,
        focused: true,
        hint: "Opened in Interaction panel for the user.",
        fenceMarkdown: interactionFenceHint(spec.id, spec.title).fenceMarkdown,
      };
    }
    default:
      return { ok: false, error: `Unknown interaction bridge action: ${String((req as { action?: string }).action)}` };
  }
}

const processingRequests = new Set<string>();
let pollInFlight = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function processSessionDir(sessionDir: string): Promise<void> {
  if (!existsSync(sessionDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(sessionDir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (!name.endsWith(".request.json")) continue;
    const reqPath = join(sessionDir, name);
    const requestId = name.replace(".request.json", "");
    const resPath = join(sessionDir, `${requestId}.result.json`);
    if (existsSync(resPath)) continue;
    if (processingRequests.has(reqPath)) continue;

    processingRequests.add(reqPath);
    try {
      const raw = readFileSync(reqPath, "utf-8");
      const req = JSON.parse(raw) as InteractionBridgeRequest;
      const result = dispatch(req);
      writeFileSync(resPath, JSON.stringify(result), "utf-8");
      try { unlinkSync(reqPath); } catch {}
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("interaction bridge request failed", { session: basename(sessionDir), error: message });
      writeFileSync(resPath, JSON.stringify({ ok: false, error: message }), "utf-8");
      try { unlinkSync(reqPath); } catch {}
    } finally {
      processingRequests.delete(reqPath);
    }
  }
}

async function pollBridge(): Promise<void> {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    mkdirSync(bridgeRoot(), { recursive: true });
    let sessions: string[];
    try {
      sessions = readdirSync(bridgeRoot());
    } catch {
      return;
    }
    for (const s of sessions) {
      await processSessionDir(join(bridgeRoot(), s));
    }
  } finally {
    pollInFlight = false;
  }
}

export function startInteractionBridge(): void {
  if (pollTimer) return;
  mkdirSync(bridgeRoot(), { recursive: true });
  pollTimer = setInterval(() => {
    void pollBridge();
  }, 50);
  log.info("Interaction bridge started");
}

export function stopInteractionBridge(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** @internal */
export async function processInteractionBridgeOnceForTests(): Promise<void> {
  await pollBridge();
}
