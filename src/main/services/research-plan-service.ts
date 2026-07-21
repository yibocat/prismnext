import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import {
  LEGACY_DRAFT_PLAN_FILENAME,
  LEGACY_DRAFT_PLAN_REL,
  RESEARCH_PLAN_DRAFTS_DIR_REL,
  RESEARCH_PLANS_DIR_REL,
  parseResearchPlan,
  researchPlanFileName,
  serializeResearchPlan,
  sessionDraftPlanRel,
  type ResearchPlanDoc,
} from "../../shared/research-plan";

function shortHex(len = 4): string {
  return randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

export function researchPlansDirAbs(projectRoot: string): string {
  return join(projectRoot.replace(/\\/g, "/"), RESEARCH_PLANS_DIR_REL);
}

export function researchPlanDraftsDirAbs(projectRoot: string): string {
  return join(projectRoot.replace(/\\/g, "/"), RESEARCH_PLAN_DRAFTS_DIR_REL);
}

export function sessionDraftPlanAbs(projectRoot: string, sessionId: string): string {
  return join(projectRoot.replace(/\\/g, "/"), sessionDraftPlanRel(sessionId));
}

/** Lightweight draft fingerprint — detect whether a Plan turn wrote/updated the file. */
export type SessionDraftMetaSnapshot = {
  relativePath: string;
  exists: boolean;
  empty: boolean;
  size: number;
  mtimeMs: number;
};

export function snapshotSessionDraftMeta(
  projectRoot: string,
  sessionId: string,
): SessionDraftMetaSnapshot {
  const relativePath = sessionDraftPlanRel(sessionId);
  const absolutePath = sessionDraftPlanAbs(projectRoot, sessionId);
  if (!existsSync(absolutePath)) {
    return { relativePath, exists: false, empty: true, size: 0, mtimeMs: 0 };
  }
  try {
    const st = statSync(absolutePath);
    const size = st.size;
    const empty = size === 0 || readFileSync(absolutePath, "utf-8").trim().length === 0;
    return {
      relativePath,
      exists: true,
      empty,
      size,
      mtimeMs: st.mtimeMs,
    };
  } catch {
    return { relativePath, exists: false, empty: true, size: 0, mtimeMs: 0 };
  }
}

/** True when after is a non-empty draft that is new or changed vs before. */
export function sessionDraftMetaShowsWrite(
  before: SessionDraftMetaSnapshot,
  after: SessionDraftMetaSnapshot,
): boolean {
  if (!after.exists || after.empty) return false;
  if (!before.exists || before.empty) return true;
  return after.mtimeMs > before.mtimeMs || after.size !== before.size;
}

export function legacyDraftPlanAbs(projectRoot: string): string {
  return join(researchPlansDirAbs(projectRoot), LEGACY_DRAFT_PLAN_FILENAME);
}

export function ensureResearchPlansDir(projectRoot: string): string {
  const dir = researchPlansDirAbs(projectRoot);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureResearchPlanDraftsDir(projectRoot: string): string {
  const dir = researchPlanDraftsDirAbs(projectRoot);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export interface WriteResearchPlanResult {
  ok: boolean;
  relativePath: string;
  absolutePath: string;
}

export function writeResearchPlan(projectRoot: string, doc: ResearchPlanDoc): WriteResearchPlanResult {
  ensureResearchPlansDir(projectRoot);

  const now = new Date().toISOString();
  const meta = {
    ...doc.meta,
    id: doc.meta.id?.trim() || shortHex(4),
    createdAt: doc.meta.createdAt?.trim() || now,
    updatedAt: now,
  };

  const normalized: ResearchPlanDoc = {
    ...doc,
    meta,
  };

  let relativePath: string;
  let absolutePath: string;
  if (meta.status === "draft") {
    const sid = meta.sessionId?.trim();
    if (!sid) {
      throw new Error("Draft plans require meta.sessionId (per-session draft path)");
    }
    ensureResearchPlanDraftsDir(projectRoot);
    relativePath = sessionDraftPlanRel(sid);
    absolutePath = sessionDraftPlanAbs(projectRoot, sid);
  } else {
    const fileName = researchPlanFileName(meta);
    relativePath = `${RESEARCH_PLANS_DIR_REL}/${fileName}`;
    absolutePath = join(researchPlansDirAbs(projectRoot), fileName);
  }

  writeFileSync(absolutePath, serializeResearchPlan(normalized), "utf-8");

  return {
    ok: true,
    relativePath,
    absolutePath,
  };
}

export type ReadDraftPlanResult =
  | {
      ok: true;
      exists: boolean;
      empty: boolean;
      relativePath: string;
      absolutePath: string;
      /** Raw file text (may include frontmatter if agent wrote it). */
      markdown: string;
      title?: string;
      description?: string;
      /** Owning chat session from Prism frontmatter, when present. */
      sessionId?: string;
    }
  | { ok: false; error: string };

function readDraftAt(
  absolutePath: string,
  relativePath: string,
): ReadDraftPlanResult {
  if (!existsSync(absolutePath)) {
    return {
      ok: true,
      exists: false,
      empty: true,
      relativePath,
      absolutePath,
      markdown: "",
    };
  }
  const markdown = readFileSync(absolutePath, "utf-8");
  const trimmed = markdown.trim();
  const parsed = trimmed ? parseResearchPlan(markdown) : null;
  const title =
    parsed?.meta.title
    || trimmed.match(/^#\s+(.+)$/m)?.[1]?.trim()
    || undefined;
  return {
    ok: true,
    exists: true,
    empty: !trimmed,
    relativePath,
    absolutePath,
    markdown,
    title,
    description: parsed?.meta.description,
    sessionId: parsed?.meta.sessionId,
  };
}

type OrphanDraftHit = {
  absolutePath: string;
  relativePath: string;
  mtimeMs: number;
  owner?: string;
  draft: Extract<ReadDraftPlanResult, { ok: true }>;
};

/**
 * Agents sometimes invent filenames under drafts/ instead of `drafts/<sessionId>.md`.
 * Find non-empty drafts this session can claim (matching or unclaimed frontmatter).
 */
function listClaimableOrphanDrafts(
  projectRoot: string,
  sessionId: string,
): OrphanDraftHit[] {
  const sid = sessionId.trim();
  const dir = researchPlanDraftsDirAbs(projectRoot);
  if (!existsSync(dir)) return [];

  const canonicalAbs = sessionDraftPlanAbs(projectRoot, sid);
  const hits: OrphanDraftHit[] = [];

  for (const name of readdirSync(dir)) {
    if (!name.toLowerCase().endsWith(".md")) continue;
    const absolutePath = join(dir, name);
    if (absolutePath === canonicalAbs) continue;
    const relativePath = `${RESEARCH_PLAN_DRAFTS_DIR_REL}/${name}`;
    const draft = readDraftAt(absolutePath, relativePath);
    if (!draft.ok || !draft.exists || draft.empty) continue;
    const owner = draft.sessionId?.trim();
    if (owner && owner !== sid) continue;
    let mtimeMs = 0;
    try {
      mtimeMs = statSync(absolutePath).mtimeMs;
    } catch {
      /* ignore */
    }
    hits.push({ absolutePath, relativePath, mtimeMs, owner, draft });
  }

  hits.sort((a, b) => {
    const aMatch = a.owner === sid ? 1 : 0;
    const bMatch = b.owner === sid ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch;
    return b.mtimeMs - a.mtimeMs;
  });
  return hits;
}

/** Rename an orphan draft onto the canonical per-session path (best-effort). */
function migrateOrphanToCanonical(
  projectRoot: string,
  sessionId: string,
  orphan: OrphanDraftHit,
): ReadDraftPlanResult {
  const sid = sessionId.trim();
  const targetRel = sessionDraftPlanRel(sid);
  const targetAbs = sessionDraftPlanAbs(projectRoot, sid);
  ensureResearchPlanDraftsDir(projectRoot);

  try {
    if (existsSync(targetAbs) && targetAbs !== orphan.absolutePath) {
      const existing = readDraftAt(targetAbs, targetRel);
      if (existing.ok && !existing.empty) {
        // Canonical already has content — prefer it; leave orphan for later cleanup.
        return existing;
      }
      // Empty placeholder — replace with orphan.
      try {
        unlinkSync(targetAbs);
      } catch {
        /* best-effort */
      }
    }
    if (orphan.absolutePath !== targetAbs) {
      renameSync(orphan.absolutePath, targetAbs);
    }
    return readDraftAt(targetAbs, targetRel);
  } catch {
    // Rename failed (cross-device etc.) — still expose the orphan so Approve works.
    return orphan.draft;
  }
}

/**
 * Read living draft for a session.
 * Prefers `drafts/<sessionId>.md`; then claimable orphans under `drafts/`;
 * then legacy `current-draft.md` when owned by (or unclaimed for) this session.
 */
export function readDraftPlan(
  projectRoot: string,
  sessionId?: string | null,
): ReadDraftPlanResult {
  try {
    const sid = sessionId?.trim() || "";
    if (sid) {
      const sessionRel = sessionDraftPlanRel(sid);
      const sessionAbs = sessionDraftPlanAbs(projectRoot, sid);
      const sessionDraft = readDraftAt(sessionAbs, sessionRel);
      if (sessionDraft.ok && sessionDraft.exists && !sessionDraft.empty) {
        return sessionDraft;
      }

      const orphan = listClaimableOrphanDrafts(projectRoot, sid)[0];
      if (orphan) {
        return migrateOrphanToCanonical(projectRoot, sid, orphan);
      }

      const legacy = readDraftAt(legacyDraftPlanAbs(projectRoot), LEGACY_DRAFT_PLAN_REL);
      if (legacy.ok && legacy.exists && !legacy.empty) {
        const owner = legacy.sessionId?.trim();
        if (!owner || owner === sid) {
          return legacy;
        }
      }

      return {
        ok: true,
        exists: false,
        empty: true,
        relativePath: sessionRel,
        absolutePath: sessionAbs,
        markdown: "",
      };
    }

    // No sessionId — legacy global draft only.
    return readDraftAt(legacyDraftPlanAbs(projectRoot), LEGACY_DRAFT_PLAN_REL);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type ClaimDraftResult =
  | {
      ok: true;
      /** Draft is non-empty and owned by `sessionId` after this call. */
      owned: boolean;
      /** True when we wrote/updated frontmatter in this call. */
      claimed: boolean;
      /** Draft belongs to a different session — caller must not show Approve chrome. */
      ownedByOther: boolean;
      sessionId?: string;
      title?: string;
      description?: string;
      relativePath?: string;
    }
  | { ok: false; error: string };

/**
 * Bind / migrate a draft to `sessionId` under `drafts/<sessionId>.md`.
 * - Migrates legacy `current-draft.md` when unclaimed or owned by this session
 * - Different session on legacy → ownedByOther
 */
export function claimDraftForSession(
  projectRoot: string,
  sessionId: string,
): ClaimDraftResult {
  const sid = sessionId.trim();
  if (!sid) {
    return { ok: false, error: "sessionId is required to claim a plan draft" };
  }

  const targetRel = sessionDraftPlanRel(sid);
  const targetAbs = sessionDraftPlanAbs(projectRoot, sid);

  try {
    ensureResearchPlanDraftsDir(projectRoot);

    const stampCanonical = (
      source: Extract<ReadDraftPlanResult, { ok: true }>,
      opts?: { claimed?: boolean },
    ): ClaimDraftResult => {
      const owner = source.sessionId?.trim();
      if (owner === sid && parseResearchPlan(source.markdown) && source.absolutePath === targetAbs) {
        return {
          ok: true,
          owned: true,
          claimed: false,
          ownedByOther: false,
          sessionId: sid,
          title: source.title,
          description: source.description,
          relativePath: targetRel,
        };
      }
      const now = new Date().toISOString();
      const { bodyMarkdown, parsed } = extractPromoteBody(source.markdown);
      const doc: ResearchPlanDoc = {
        meta: {
          id: parsed?.meta.id?.trim() || shortHex(4),
          status: "draft",
          sessionId: sid,
          createdAt: parsed?.meta.createdAt || now,
          updatedAt: now,
          title: source.title || parsed?.meta.title,
          description: source.description || parsed?.meta.description,
        },
        body: bodyMarkdown,
        steps: [],
      };
      writeFileSync(targetAbs, serializeResearchPlan(doc), "utf-8");
      return {
        ok: true,
        owned: true,
        claimed: opts?.claimed ?? true,
        ownedByOther: false,
        sessionId: sid,
        title: doc.meta.title,
        description: doc.meta.description,
        relativePath: targetRel,
      };
    };

    // Already have a per-session draft.
    if (existsSync(targetAbs)) {
      const existing = readDraftAt(targetAbs, targetRel);
      if (!existing.ok) return existing;
      if (!existing.empty) {
        const owner = existing.sessionId?.trim();
        if (owner && owner !== sid) {
          return {
            ok: true,
            owned: false,
            claimed: false,
            ownedByOther: true,
            sessionId: owner,
            title: existing.title,
            description: existing.description,
            relativePath: targetRel,
          };
        }
        return stampCanonical(existing, { claimed: owner !== sid });
      }
      // Empty canonical — fall through to orphan / legacy migration.
    }

    // Agent wrote a custom name under drafts/ — migrate to canonical path.
    const orphan = listClaimableOrphanDrafts(projectRoot, sid)[0];
    if (orphan) {
      const migrated = migrateOrphanToCanonical(projectRoot, sid, orphan);
      if (!migrated.ok) return migrated;
      if (!migrated.empty) {
        return stampCanonical(migrated);
      }
    }

    // Migrate legacy current-draft.md → per-session path.
    const legacyAbs = legacyDraftPlanAbs(projectRoot);
    if (existsSync(legacyAbs)) {
      const legacy = readDraftAt(legacyAbs, LEGACY_DRAFT_PLAN_REL);
      if (!legacy.ok) return legacy;
      if (!legacy.empty) {
        const owner = legacy.sessionId?.trim();
        if (owner && owner !== sid) {
          return {
            ok: true,
            owned: false,
            claimed: false,
            ownedByOther: true,
            sessionId: owner,
            title: legacy.title,
            description: legacy.description,
            relativePath: LEGACY_DRAFT_PLAN_REL,
          };
        }
        const now = new Date().toISOString();
        const { bodyMarkdown, parsed } = extractPromoteBody(legacy.markdown);
        const doc: ResearchPlanDoc = {
          meta: {
            id: parsed?.meta.id?.trim() || shortHex(4),
            status: "draft",
            sessionId: sid,
            createdAt: parsed?.meta.createdAt || now,
            updatedAt: now,
            title: legacy.title || parsed?.meta.title,
            description: legacy.description || parsed?.meta.description,
          },
          body: bodyMarkdown,
          steps: [],
        };
        writeFileSync(targetAbs, serializeResearchPlan(doc), "utf-8");
        try {
          unlinkSync(legacyAbs);
        } catch {
          /* best-effort remove legacy */
        }
        return {
          ok: true,
          owned: true,
          claimed: true,
          ownedByOther: false,
          sessionId: sid,
          title: doc.meta.title,
          description: doc.meta.description,
          relativePath: targetRel,
        };
      }
    }

    return {
      ok: true,
      owned: false,
      claimed: false,
      ownedByOther: false,
      relativePath: targetRel,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type PromoteDraftResult =
  | {
      ok: true;
      relativePath: string;
      absolutePath: string;
      title?: string;
      markdown: string;
    }
  | { ok: false; error: string };

export type DiscardDraftResult =
  | { ok: true; discarded: boolean }
  | { ok: false; error: string };

function extractPromoteBody(draftMarkdown: string): {
  bodyMarkdown: string;
  parsed: ReturnType<typeof parseResearchPlan>;
} {
  const parsed = parseResearchPlan(draftMarkdown);
  let bodyMarkdown = draftMarkdown.trim();

  if (parsed?.body?.trim()) {
    bodyMarkdown = parsed.body.trim();
  } else if (parsed && (parsed.steps.length > 0 || parsed.goal || parsed.conclusions)) {
    const parts: string[] = [];
    if (parsed.meta.title) parts.push(`# ${parsed.meta.title}`, "");
    if (parsed.goal) parts.push("## Goal", "", parsed.goal, "");
    if (parsed.steps.length > 0) {
      parts.push("## Steps", "");
      parsed.steps.forEach((s, i) => {
        parts.push(`${i + 1}. ${s.text}`);
      });
      parts.push("");
    }
    if (parsed.conclusions) parts.push("## Conclusions", "", parsed.conclusions, "");
    bodyMarkdown = parts.join("\n").trim();
  } else if (parsed) {
    const stripped = draftMarkdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
    bodyMarkdown = stripped || bodyMarkdown;
  }

  return { bodyMarkdown, parsed };
}

/**
 * Approve: refresh frontmatter on the session draft, then **rename**
 * → dated `YYYY-MM-DD-<id>.md`.
 */
export function promoteDraftPlan(
  projectRoot: string,
  opts: {
    sessionId?: string;
    /** @deprecated Ignored — promote always yields `approved` via rename. */
    status?: "approved" | "snapshot";
  } = {},
): PromoteDraftResult {
  const callerSession = opts.sessionId?.trim();
  const draft = readDraftPlan(projectRoot, callerSession);
  if (!draft.ok) return draft;
  if (draft.empty) {
    return { ok: false, error: "Plan draft is empty — write a plan to the draft file first." };
  }

  const owner = draft.sessionId?.trim();
  if (callerSession && owner && owner !== callerSession) {
    return {
      ok: false,
      error: "Plan draft belongs to another chat session — discard it or continue in that session.",
    };
  }

  try {
    const dir = ensureResearchPlansDir(projectRoot);
    const now = new Date().toISOString();
    const id = shortHex(4);
    const { bodyMarkdown, parsed } = extractPromoteBody(draft.markdown);
    const title = draft.title || parsed?.meta.title;

    const doc: ResearchPlanDoc = {
      meta: {
        id,
        status: "approved",
        sessionId: callerSession || owner || parsed?.meta.sessionId,
        createdAt: parsed?.meta.createdAt || now,
        updatedAt: now,
        title,
        description: draft.description || parsed?.meta.description,
      },
      body: bodyMarkdown,
      steps: [],
    };

    const markdown = serializeResearchPlan(doc);
    const fileName = researchPlanFileName(doc.meta);
    const absolutePath = join(dir, fileName);
    const relativePath = `${RESEARCH_PLANS_DIR_REL}/${fileName}`;
    const draftAbs = draft.absolutePath;

    writeFileSync(draftAbs, markdown, "utf-8");
    if (existsSync(absolutePath)) {
      unlinkSync(absolutePath);
    }
    renameSync(draftAbs, absolutePath);

    return {
      ok: true,
      relativePath,
      absolutePath,
      title,
      markdown,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Deny / Exit Plan: delete this session's draft (orphans + legacy if owned). */
export function discardDraftPlan(
  projectRoot: string,
  sessionId?: string | null,
): DiscardDraftResult {
  try {
    const sid = sessionId?.trim() || "";
    let discarded = false;

    if (sid) {
      const sessionAbs = sessionDraftPlanAbs(projectRoot, sid);
      if (existsSync(sessionAbs)) {
        unlinkSync(sessionAbs);
        discarded = true;
      }
      // Also remove agent-invented drafts that already stamp this sessionId.
      for (const orphan of listClaimableOrphanDrafts(projectRoot, sid)) {
        if (orphan.owner !== sid) continue;
        try {
          unlinkSync(orphan.absolutePath);
          discarded = true;
        } catch {
          /* best-effort */
        }
      }
    }

    const legacyAbs = legacyDraftPlanAbs(projectRoot);
    if (existsSync(legacyAbs)) {
      if (!sid) {
        unlinkSync(legacyAbs);
        discarded = true;
      } else {
        const legacy = readDraftAt(legacyAbs, LEGACY_DRAFT_PLAN_REL);
        const owner = legacy.ok ? legacy.sessionId?.trim() : undefined;
        if (!owner || owner === sid) {
          unlinkSync(legacyAbs);
          discarded = true;
        }
      }
    }

    return { ok: true, discarded };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** True when this session has a non-empty pending draft on disk. */
export function sessionHasPendingPlanDraft(
  projectRoot: string,
  sessionId: string,
): boolean {
  const draft = readDraftPlan(projectRoot, sessionId);
  if (!draft.ok || draft.empty) return false;
  const owner = draft.sessionId?.trim();
  return !owner || owner === sessionId.trim();
}
