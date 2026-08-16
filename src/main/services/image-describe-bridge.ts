/**
 * Polls the image-describe file bridge for OpenCode custom tool requests.
 *
 * The OpenCode `image-describe` tool writes `<session>/<id>.request.json`;
 * this bridge validates the path, reads the image, describes it via the
 * configured multimodal helper (vision-fallback), and writes the result file.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, basename, extname, relative, resolve, sep } from "node:path";
import { createLogger } from "./logger";
import { getImageDescribeBridgeRoot } from "./prism-bridge-paths";
import { getSessionProjectRoot } from "./chat-session-registry";
import { resolveFigureAbsPath } from "../../shared/interaction-figure-fs";
import {
  describeImagesWithConfiguredHelper,
  resolveVisionHelperFromSettings,
} from "./vision-fallback";

const log = createLogger("image-describe-bridge", "agent");

/**
 * Per-image byte cap. Matches the composer binary-attachment cap
 * (prompt-file-attachments MAX_BLOB_BYTES) and Anthropic's 5 MB/image API
 * limit — the smallest common denominator among helper providers.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Vision APIs accept raster formats only (no svg/bmp). */
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export type ImageDescribeActionRequest = {
  action?: string;
  sessionId?: string;
  projectRoot?: string;
  imagePath?: string;
  question?: string;
};

/** In-memory entry for ToolHost — same work as the disk-bridge poller, no request.json. */
export async function executeImageDescribeAction(
  req: ImageDescribeActionRequest,
): Promise<Record<string, unknown>> {
  return dispatch(req);
}

function bridgeRoot(): string {
  return getImageDescribeBridgeRoot();
}

function resolveProjectRoot(req: ImageDescribeActionRequest): string {
  const fromSession = req.sessionId ? getSessionProjectRoot(req.sessionId) : undefined;
  return (fromSession || req.projectRoot?.trim() || "").replace(/\\/g, "/");
}

async function dispatch(req: ImageDescribeActionRequest): Promise<Record<string, unknown>> {
  if (req.action !== "describe") {
    return { ok: false, error: `Unknown image-describe bridge action: ${String(req.action)}` };
  }

  const helper = resolveVisionHelperFromSettings();
  if (!helper) {
    return {
      ok: false,
      error:
        "No multimodal helper model is configured. Ask the user to pick one under " +
        "Settings → Models → Multimodal helper, then retry.",
    };
  }

  const projectRoot = resolveProjectRoot(req);
  if (!projectRoot) {
    return {
      ok: false,
      error: "Project root unknown for this chat session.",
      hint: "Open a project in prismnext and start a new chat tab from that project.",
    };
  }

  const rawPath = typeof req.imagePath === "string" ? req.imagePath.trim() : "";
  if (!rawPath) return { ok: false, error: "missing imagePath" };

  const absPath = resolveFigureAbsPath(projectRoot, rawPath);
  if (!absPath) {
    return {
      ok: false,
      error: `Image path escapes the project root: ${rawPath}`,
      hint: "Pass an image path inside the project (absolute or project-relative).",
    };
  }

  const ext = extname(absPath).toLowerCase().slice(1);
  const mimeType = IMAGE_MIME_BY_EXT[ext];
  if (!mimeType) {
    return {
      ok: false,
      error: `Unsupported image type ".${ext || "?"}" (use png/jpg/jpeg/webp/gif): ${rawPath}`,
    };
  }

  let size: number;
  try {
    const st = statSync(absPath);
    if (!st.isFile()) {
      return { ok: false, error: `Not a file: ${rawPath}` };
    }
    size = st.size;
  } catch {
    return { ok: false, error: `Image file not found on disk: ${rawPath}` };
  }
  if (size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error:
        `Image is too large (${(size / 1024 / 1024).toFixed(1)} MB > ` +
        `${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB cap): ${rawPath}. Downscale or crop it first.`,
    };
  }

  try {
    const data = readFileSync(absPath).toString("base64");
    const question = typeof req.question === "string" && req.question.trim() ? req.question.trim() : undefined;
    const [desc] = await describeImagesWithConfiguredHelper([
      { name: basename(absPath), mimeType, data, question },
    ]);
    const relPath = relative(resolve(projectRoot), absPath).split(sep).join("/");
    return {
      ok: true,
      path: relPath,
      description: desc?.text ?? "",
      model: `${helper.providerId}/${helper.modelId}`,
      cached: desc?.cached === true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("image describe failed", { path: rawPath, error: message });
    return { ok: false, error: message };
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
      const req = JSON.parse(raw) as ImageDescribeActionRequest;
      const result = await dispatch(req);
      writeFileSync(resPath, JSON.stringify(result), "utf-8");
      try { unlinkSync(reqPath); } catch {}
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("image-describe bridge request failed", { session: basename(sessionDir), error: message });
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

export function startImageDescribeBridge(): void {
  if (pollTimer) return;
  mkdirSync(bridgeRoot(), { recursive: true });
  pollTimer = setInterval(() => {
    void pollBridge();
  }, 50);
  log.info("Image describe bridge started");
}

export function stopImageDescribeBridge(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** @internal */
export async function processImageDescribeBridgeOnceForTests(): Promise<void> {
  await pollBridge();
}
