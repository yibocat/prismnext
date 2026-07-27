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
  sceneProgramNeedsSource,
  sceneSourceExists,
  upsertInteractionSpec,
  writeInteractionSceneSource,
} from "./interaction-store";
import {
  interactionFenceHint,
  parseInteractionSpec,
  type InteractionSpec,
} from "../../shared/interaction-spec";
import {
  DEFAULT_SCENE_ENTRY,
  resolveSceneEntry,
} from "../../shared/interaction-scene";
import { SCENE_PROGRAM_SAMPLE } from "../../shared/interaction-scene-contract";
import {
  isInteractionSceneIrKind,
  SCENE_IR_SAMPLE_MODEL,
  validateSceneIrSpec,
  buildSceneIr,
} from "../../shared/interaction-scene-ir";
import { initialBindingValues, parseMathBindings } from "../../shared/interaction-math";
import { broadcastInteractionChanged } from "./interaction-ui-events";

const log = createLogger("interaction-bridge", "agent");

type InteractionBridgeRequest = {
  action: "list" | "read" | "write" | "open";
  sessionId?: string;
  projectRoot?: string;
  id?: string;
  kindPrefix?: string;
  spec?: InteractionSpec;
  /** Full scene.js source for scene.program (required on create unless entry is builtin:*) */
  sceneSource?: string;
  focus?: boolean;
};

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
            "Panel mount failed previously. Fix sceneSource via interaction-write, then re-open.",
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
      const raw = req.spec;
      const parsed = parseInteractionSpec(raw);
      if (!parsed) return { ok: false, error: "invalid_spec" };

      const sceneSource =
        typeof req.sceneSource === "string" ? req.sceneSource : undefined;

      if (isInteractionSceneIrKind(parsed.kind)) {
        if (sceneSource != null) {
          return {
            ok: false,
            error: "scene.ir does not use sceneSource. Put declarative model in spec.model.",
            sample: SCENE_IR_SAMPLE_MODEL,
          };
        }
        const ir = validateSceneIrSpec(parsed);
        if (!ir.ok) {
          return {
            ok: false,
            error: ir.error,
            sample: SCENE_IR_SAMPLE_MODEL,
          };
        }
        const previewBindings = initialBindingValues(parseMathBindings(parsed.bindings));
        const preview = buildSceneIr(parsed, previewBindings);
        if (!preview.ok) {
          return {
            ok: false,
            error: preview.error,
            phase: "compile-preview",
            sample: SCENE_IR_SAMPLE_MODEL,
          };
        }
      }

      if (parsed.kind === "scene.program" && sceneSource != null) {
        return {
          ok: false,
          error:
            "scene.program no longer accepts sceneSource (arbitrary JS). Use kind scene.ir with spec.model for surfaces, metrics, and tangent layers.",
          sample: SCENE_IR_SAMPLE_MODEL,
        };
      }

      const entry = resolveSceneEntry(parsed) ?? DEFAULT_SCENE_ENTRY;
      const needsScript = sceneProgramNeedsSource(parsed);
      const hasExistingScript =
        needsScript && sceneSourceExists(projectRoot, parsed.id, entry);

      if (needsScript && sceneSource == null && !hasExistingScript) {
        return {
          ok: false,
          error:
            "scene.program requires sceneSource (full scene.js text). Do not use import — copy the sample API.",
          hint: "Pass sceneSource with export async function mount(ctx) { const handle = await ctx.three.ensure(); ... }",
          sample: SCENE_PROGRAM_SAMPLE,
        };
      }

      let sceneRelativePath: string | undefined;
      if (needsScript && sceneSource != null) {
        const sceneWrite = writeInteractionSceneSource(
          projectRoot,
          parsed.id,
          sceneSource,
          entry.startsWith("builtin:") ? DEFAULT_SCENE_ENTRY : entry,
        );
        if (!sceneWrite.ok) {
          return {
            ok: false,
            error: sceneWrite.error ?? "scene_write_failed",
            sample: SCENE_PROGRAM_SAMPLE,
          };
        }
        sceneRelativePath = sceneWrite.relativePath;
      }

      const result = upsertInteractionSpec(projectRoot, parsed);
      if (!result.ok || !result.spec) {
        return { ok: false, error: result.error ?? "write_failed" };
      }
      const body = {
        ...specResponse(projectRoot, result.spec),
        created: result.created === true,
        ...(sceneRelativePath ? { sceneRelativePath } : {}),
      };
      broadcastInteractionChanged({
        projectRoot,
        id: result.spec.id,
        title: result.spec.title,
        reason: "write",
        focus: true,
      });
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
