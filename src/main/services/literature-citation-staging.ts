/**
 * Session-scoped citation staging. Writes staging.json under
 * ~/.prismnext/sessions/<conversationId>/citations/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "./logger";
import { resolveSessionScratchKey } from "./chat-session-registry";
import { sessionCitationsDir } from "../workbench/home";
import { normalizeArxivId, normalizeDoi } from "../../shared/literature/doi-utils";
import { findExistingByIdentifier } from "./literature-service";
import { bibliographicToPaperPatch } from "../../shared/bibliographic-metadata/helpers";
import { resolveBibliographicMetadata } from "../../shared/bibliographic-metadata";
import type { StagedCitationPayload, StageResult } from "../../shared/literature/citation-staging";

const log = createLogger("literature-citation-staging", "agent");

interface SessionStageRecord {
  refId: number;
  doi: string | null;
  arxivId: string | null;
  title?: string;
  year?: number | null;
  summary?: string | null;
}

function sessionStagingPath(scratchKey: string): string {
  return join(sessionCitationsDir(scratchKey), "staging.json");
}

function readSessionStaging(scratchKey: string): SessionStageRecord[] {
  try {
    const p = sessionStagingPath(scratchKey);
    if (!existsSync(p)) return [];
    return JSON.parse(readFileSync(p, "utf-8")) as SessionStageRecord[];
  } catch {
    return [];
  }
}

function writeSessionStaging(scratchKey: string, records: SessionStageRecord[]): void {
  try {
    const dir = sessionCitationsDir(scratchKey);
    mkdirSync(dir, { recursive: true });
    writeFileSync(sessionStagingPath(scratchKey), JSON.stringify(records), "utf-8");
  } catch (err) {
    log.warn("failed to persist session staging", {
      session: scratchKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Stage a citation with session-scoped refId (shared by the Pi tool + IPC). */
export async function stageLiteratureCitation(
  projectRoot: string,
  sessionId: string,
  payload: {
    doi?: string;
    arxivId?: string;
    sourceUrl?: string;
    discoveredFrom?: StagedCitationPayload["discoveredFrom"];
  },
): Promise<StageResult> {
  const stagingSessionId = resolveSessionScratchKey(sessionId);
  const normDoi = payload.doi?.trim() ? normalizeDoi(payload.doi.trim()) : null;
  const normArxiv = payload.arxivId?.trim() ? normalizeArxivId(payload.arxivId.trim()) : null;

  if (!normDoi && !normArxiv) {
    return {
      staged: false,
      verified: false,
      error: "Invalid or missing DOI/arXiv ID.",
      hint: "Use an exact DOI or arXiv ID from websearch or the user. Do not invent identifiers.",
    };
  }
  if (normDoi && normArxiv) {
    return { staged: false, verified: false, error: "Provide only one of doi or arxivId." };
  }

  const records = readSessionStaging(stagingSessionId);
  const matched = records.find(
    (r) =>
      (normDoi && r.doi?.toLowerCase() === normDoi.toLowerCase()) ||
      (normArxiv && r.arxivId?.toLowerCase() === normArxiv.toLowerCase()),
  );

  try {
    const { metadata } = await resolveBibliographicMetadata(
      {
        doi: normDoi ?? undefined,
        arxivId: normArxiv ?? undefined,
      },
      { fast: true },
    );
    if (!metadata.title?.trim()) {
      return {
        staged: false,
        verified: false,
        error: "Catalog returned no verifiable title.",
        hint: "Confirm the identifier with websearch or the user.",
      };
    }
    const patch = bibliographicToPaperPatch(metadata);
    const existing = findExistingByIdentifier(projectRoot, { doi: normDoi, arxivId: normArxiv });
    const citationPayload: StagedCitationPayload = {
      title: (patch.title as string) ?? metadata.title,
      authors: (patch.authors as string | null) ?? null,
      year: (patch.year as number | null) ?? null,
      venue: (patch.venue as string | null) ?? null,
      type: (patch.type as string | null) ?? null,
      doi: (patch.doi as string | null) ?? null,
      arxivId: (patch.arxiv_id as string | null) ?? null,
      abstract: (patch.abstract as string | null) ?? null,
      cslJson: null,
      sourceUrl: payload.sourceUrl ?? null,
      catalogSource: metadata.source ?? null,
      catalogVerified: true,
      verifyError: null,
      discoveredFrom: payload.discoveredFrom ?? "agent",
      libraryPaperId: existing?.paperId ?? null,
      libraryBibkey: existing?.bibkey ?? null,
    };

    let refId = matched?.refId ?? 0;
    if (!matched) {
      refId = records.reduce((max, r) => (r.refId > max ? r.refId : max), 0) + 1;
      records.push({
        refId,
        doi: normDoi,
        arxivId: normArxiv,
        title: citationPayload.title,
        year: citationPayload.year,
        summary: citationPayload.abstract?.slice(0, 240) ?? null,
      });
      writeSessionStaging(stagingSessionId, records);
    } else if (matched && citationPayload.title) {
      matched.title = citationPayload.title;
      matched.year = citationPayload.year;
      matched.summary = citationPayload.abstract?.slice(0, 240) ?? matched.summary ?? null;
      writeSessionStaging(stagingSessionId, records);
    }

    return {
      staged: true,
      verified: true,
      refId,
      citation: citationPayload,
      alreadyInLibrary: Boolean(existing),
      libraryBibkey: existing?.bibkey ?? null,
      hint: existing
        ? "Already in library. Cite as [n]."
        : "Cite as [n] in your reply. User will confirm before adding to library.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("literature stage failed", { doi: normDoi, arxivId: normArxiv, error: message });
    return {
      staged: false,
      verified: false,
      error: message,
      hint: "Identifier not found in external catalogs. Confirm with websearch or ask the user — do not guess.",
    };
  }
}
