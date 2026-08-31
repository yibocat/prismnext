import { parseRemoteAbs, RemoteOperationError } from "../../shared/remote";

export const DESKTOP_ONLY_LITERATURE_METHODS = [
  "literature:pickPdf",
  "literature:pickBibTeX",
  "literature:pickProjectRoot",
  "literature:exportBibToFile",
] as const;

export const HOST_LITERATURE_METHODS = [
  "literature:list",
  "literature:resolveAbs",
  "literature:getPdfCacheStatus",
  "literature:getStorageStats",
  "literature:pruneOrphanAttachments",
  "literature:search",
  "literature:get",
  "literature:ingestPdf",
  "literature:replacePdf",
  "literature:attachLocalPdf",
  "literature:createFromIdentifier",
  "literature:createFromStagedCitation",
  "literature:findExisting",
  "literature:stage",
  "literature:applyMetadata",
  "literature:importBibTeX",
  "literature:getAnnotations",
  "literature:saveAnnotation",
  "literature:deleteAnnotation",
  "literature:readPdfBytes",
  "literature:ensurePaperPdf",
  "literature:createPaper",
  "literature:applyIdentifiers",
  "literature:fetchAndApplyMetadata",
  "literature:downloadPdf",
  "literature:updatePaper",
  "literature:regenerateAiMetadata",
  "literature:deletePaper",
  "literature:importToLocal",
  "literature:exportBib",
  "literature:formatBibliography",
  "literature:cite",
  "literature:citationHealth",
  "literature:mergeIntoProjectBib",
  "literature:importFromProjectBib",
  "literature:readingList",
  "literature:listCollections",
  "literature:createCollection",
  "literature:updateCollection",
  "literature:deleteCollection",
  "literature:listCollectionPaperIds",
  "literature:addPapersToCollection",
  "literature:removePapersFromCollection",
  "literature:importFromProject",
  "literature:getCitationNetwork",
  "literature:getCitationNetworkPage",
  "literature:importBatch",
  "literature:getZoteroBinding",
  "literature:setZoteroBinding",
  "literature:getZoteroLastSync",
] as const;

export type HostLiteratureMethod = (typeof HOST_LITERATURE_METHODS)[number];

export function isHostLiteratureMethod(method: string): method is HostLiteratureMethod {
  return (HOST_LITERATURE_METHODS as readonly string[]).includes(method);
}

export const DESKTOP_ONLY_EXTRACT_METHODS = ["extract:testMineru"] as const;

export const HOST_EXTRACT_METHODS = [
  "extract:enqueue",
  "extract:cancel",
  "extract:list",
  "extract:get",
  "extract:getBlocks",
  "extract:openMd",
  "extract:resume",
  "extract:retry",
  "extract:enqueueBatch",
  "extract:enqueueCollection",
  "extract:readPdf",
] as const;

export type HostExtractMethod = (typeof HOST_EXTRACT_METHODS)[number];

export function isHostExtractMethod(method: string): method is HostExtractMethod {
  return (HOST_EXTRACT_METHODS as readonly string[]).includes(method);
}

export function isHostLiteratureOrExtractMethod(method: string): boolean {
  return isHostLiteratureMethod(method) || isHostExtractMethod(method);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function remoteProfileIdFromLiteratureArgs(args: unknown): string | null {
  const rec = asRecord(args);
  if (!rec) return null;
  for (const key of ["projectRoot", "targetRoot", "sourceRoot"] as const) {
    const value = rec[key];
    if (typeof value !== "string") continue;
    const parsed = parseRemoteAbs(value);
    if (parsed) return parsed.profileId;
  }
  return null;
}

export function rewriteLiteratureParamsForHost(params: unknown): Record<string, unknown> {
  const rec = asRecord(params) ?? {};
  const next = { ...rec };
  for (const key of ["projectRoot", "targetRoot", "sourceRoot", "pdfPath"]) {
    const value = next[key];
    if (typeof value !== "string") continue;
    const parsed = parseRemoteAbs(value);
    if (parsed) next[key] = parsed.abs;
  }
  return next;
}

const EMPTY_LIST: unknown[] = [];

/** Quiet reads while a remembered remote project is focused before SSH is up. */
export function disconnectedLiteratureProbe(
  method: string,
): { hit: true; result: unknown } | { hit: false } {
  if (
    method === "literature:list"
    || method === "literature:search"
    || method === "literature:readingList"
    || method === "literature:listCollections"
    || method === "literature:listCollectionPaperIds"
    || method === "literature:getAnnotations"
  ) {
    return { hit: true, result: EMPTY_LIST };
  }
  if (
    method === "literature:getPdfCacheStatus"
    || method === "literature:getStorageStats"
  ) {
    return { hit: true, result: {} };
  }
  if (method === "literature:get" || method === "literature:findExisting") {
    return { hit: true, result: null };
  }
  if (method === "extract:list") {
    return { hit: true, result: EMPTY_LIST };
  }
  if (method === "extract:resume") {
    return { hit: true, result: { ok: true } };
  }
  if (method === "extract:get") {
    return { hit: true, result: { state: null, markdown: null } };
  }
  if (method === "extract:getBlocks") {
    return { hit: true, result: { state: null, blocks: null } };
  }
  if (method === "literature:getZoteroBinding") {
    return { hit: true, result: {} };
  }
  if (method === "literature:getZoteroLastSync") {
    return { hit: true, result: { lastSyncAt: null } };
  }
  return { hit: false };
}

export async function routeHostLiteratureMethod(
  method: string,
  args: unknown,
  broker: {
    isBound(profileId: string): boolean;
    invoke(profileId: string, method: string, params: unknown): Promise<unknown>;
  },
): Promise<unknown | undefined> {
  const profileId = remoteProfileIdFromLiteratureArgs(args);
  if (!profileId || !isHostLiteratureOrExtractMethod(method)) return undefined;
  if (!broker.isBound(profileId)) {
    const probe = disconnectedLiteratureProbe(method);
    if (probe.hit) return probe.result;
    throw new RemoteOperationError("not_connected", "Not connected.");
  }
  return broker.invoke(profileId, method, rewriteLiteratureParamsForHost(args));
}
