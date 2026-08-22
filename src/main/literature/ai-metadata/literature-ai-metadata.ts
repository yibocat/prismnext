import {
  AI_METADATA_KEYWORD_MAX,
  buildAiMetadataPrompt,
  parseAiMetadataLlmJson,
} from "../../../shared/literature/ai-metadata";
import { aiMetadataFingerprint } from "./literature-ai-metadata-fingerprint";
import {
  LITERATURE_AI_METADATA_SETUP_HINT,
  resolveLiteratureAiMetadataModel,
} from "../../../shared/literature/ai-metadata-model";
import {
  normalizePaperTagsWithCatalog,
  parsePaperTagsJson,
  resolvePaperTagDisplay,
} from "../../../shared/literature/paper-tags";
import { getSettings } from "../../services/settings";
import { completeChatJson } from "../../services/provider-chat";
import { heuristicAbstractAndKeywords } from "./literature-ai-metadata-heuristics";
import {
  collectProjectTagDisplays,
  getPaper,
  openLibraryDb,
  updatePaper,
  upsertPaperAiMetadata,
  type PaperAiMetadataStatus,
} from "../facade";
import { broadcastToRenderer } from "../broadcast";

export type AiMetadataRunResult = {
  status: PaperAiMetadataStatus;
  error?: string;
};

function resolveModel(settings: ReturnType<typeof getSettings>) {
  return resolveLiteratureAiMetadataModel({
    literatureAiMetadataModel:
      typeof settings.literatureAiMetadataModel === "string"
        ? settings.literatureAiMetadataModel
        : undefined,
    aiProvider: settings.aiProvider as string | undefined,
    aiModel: settings.aiModel as string | null | undefined,
  });
}

function resolveApiKey(
  settings: ReturnType<typeof getSettings>,
  provider: string,
): { apiKey: string; baseUrl?: string } | null {
  const keys = settings.aiApiKeys as Record<string, string> | undefined;
  const apiKey = keys?.[provider]?.trim();
  if (!apiKey) return null;
  const baseUrls = settings.aiBaseUrls as Record<string, string> | undefined;
  const baseUrl = baseUrls?.[provider]?.trim();
  return { apiKey, baseUrl: baseUrl || undefined };
}

function broadcastAiMetadataChanged(projectRoot: string, paperId: string): void {
  broadcastToRenderer("literature:aiMetadataChanged", { projectRoot, paperId });
}

export async function runAiMetadataForPaper(
  projectRoot: string,
  paperId: string,
  opts: { force?: boolean } = {},
): Promise<AiMetadataRunResult> {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) return { status: "failed", error: "Paper not found" };

  const settings = getSettings();
  const modelInfo = resolveModel(settings);
  if (!modelInfo) {
    const message = LITERATURE_AI_METADATA_SETUP_HINT;
    upsertPaperAiMetadata(openLibraryDb(projectRoot), paperId, {
      status: "failed",
      error: message,
      finished_at: Date.now(),
    });
    broadcastAiMetadataChanged(projectRoot, paperId);
    return { status: "failed", error: message };
  }

  const auth = resolveApiKey(settings, modelInfo.provider);
  if (!auth) {
    upsertPaperAiMetadata(openLibraryDb(projectRoot), paperId, {
      status: "failed",
      error: `No API key for ${modelInfo.provider}`,
      finished_at: Date.now(),
    });
    broadcastAiMetadataChanged(projectRoot, paperId);
    return { status: "failed", error: `No API key for ${modelInfo.provider}` };
  }

  const heuristics = heuristicAbstractAndKeywords(projectRoot, paperId);
  const abstractForLlm = paper.abstract?.trim() || heuristics.abstract?.trim() || "";
  if (!abstractForLlm) {
    upsertPaperAiMetadata(openLibraryDb(projectRoot), paperId, {
      status: "skipped",
      error: null,
      finished_at: Date.now(),
    });
    broadcastAiMetadataChanged(projectRoot, paperId);
    return { status: "skipped" };
  }

  const fingerprint = aiMetadataFingerprint({
    abstractText: abstractForLlm,
    pdfSha: paper.pdf_sha,
    model: modelInfo.modelKey,
  });

  if (
    !opts.force &&
    paper.ai_metadata_sha === fingerprint &&
    paper.ai_summary?.trim()
  ) {
    upsertPaperAiMetadata(openLibraryDb(projectRoot), paperId, {
      status: "ready",
      finished_at: Date.now(),
    });
    return { status: "ready" };
  }

  upsertPaperAiMetadata(openLibraryDb(projectRoot), paperId, {
    status: "running",
    model: modelInfo.modelKey,
    error: null,
  });
  broadcastAiMetadataChanged(projectRoot, paperId);

  try {
    const prompt = buildAiMetadataPrompt(paper.title, abstractForLlm, heuristics.keywordHints);
    const raw = await completeChatJson({
      provider: modelInfo.provider,
      model: modelInfo.model,
      apiKey: auth.apiKey,
      baseUrl: auth.baseUrl,
      prompt,
    });
    const parsed = parseAiMetadataLlmJson(raw);
    if (!parsed?.summary.trim()) {
      throw new Error("Invalid AI metadata response");
    }

    const db = openLibraryDb(projectRoot);
    const catalog = collectProjectTagDisplays(db);
    const existingTags = parsePaperTagsJson(paper.tags);
    const keywordDisplays = parsed.keywords
      .map((kw) => resolvePaperTagDisplay(kw, catalog))
      .filter((k): k is string => Boolean(k))
      .slice(0, AI_METADATA_KEYWORD_MAX);

    const mergedTags = normalizePaperTagsWithCatalog(
      [...existingTags, ...keywordDisplays],
      catalog,
    );

    const patch: Parameters<typeof updatePaper>[2] = {
      ai_summary: parsed.summary,
      ai_metadata_at: Date.now(),
      ai_metadata_sha: fingerprint,
      tags: mergedTags,
    };
    if (!paper.abstract?.trim() && heuristics.abstract?.trim()) {
      patch.abstract = heuristics.abstract.trim();
    }

    updatePaper(projectRoot, paperId, patch);

    upsertPaperAiMetadata(db, paperId, {
      status: "ready",
      model: modelInfo.modelKey,
      error: null,
      finished_at: Date.now(),
    });
    broadcastAiMetadataChanged(projectRoot, paperId);
    return { status: "ready" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    upsertPaperAiMetadata(openLibraryDb(projectRoot), paperId, {
      status: "failed",
      error: message,
      finished_at: Date.now(),
    });
    broadcastAiMetadataChanged(projectRoot, paperId);
    return { status: "failed", error: message };
  }
}
