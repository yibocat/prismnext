import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeArxivId, normalizeDoi } from "../../../shared/literature/doi-utils";
import { getSettings, updateSettings } from "../../services/settings";
export { buildZoteroPaperCslJson } from "./zotero-csl";

/** Zotero desktop local connector (default port 23119). */
export const ZOTERO_LOCAL_BASE = "http://127.0.0.1:23119";

export const ZOTERO_WEB_BASE = "https://api.zotero.org";

export interface ZoteroCredentials {
  userId?: string;
  apiKey?: string;
}

export type ZoteroConnectionMode = "local" | "web" | "offline";

export interface ZoteroStatus {
  mode: ZoteroConnectionMode;
  localReachable: boolean;
  bbtInstalled: boolean;
  /** BBT debug-bridge — required for local collection writes without Web API. */
  bbtDebugBridge: boolean;
  webReachable: boolean;
  userId?: string;
  error?: string;
}

export interface ZoteroCollection {
  key: string;
  name: string;
  parentKey: string | null;
  version: number;
}

export interface ZoteroItemSummary {
  key: string;
  itemType: string;
  title: string;
  version: number;
  date?: string;
  doi?: string;
  creators: string[];
}

/** Full item payload for library sync. */
export interface ZoteroItemRecord extends ZoteroItemSummary {
  abstract: string | null;
  venue: string | null;
  arxivId: string | null;
  authorsJson: string | null;
  editorsJson: string | null;
  year: number | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  url: string | null;
  language: string | null;
  series: string | null;
  bookTitle: string | null;
  proceedingsTitle: string | null;
  journalAbbreviation: string | null;
  isbn: string | null;
}

interface ZoteroApiObject {
  key: string;
  version?: number;
  data: Record<string, unknown>;
}

export type FetchFn = typeof fetch;

function credentialsFromSettings(): ZoteroCredentials {
  const settings = getSettings();
  return {
    userId: settings.zoteroUserId?.trim() || undefined,
    apiKey: settings.zoteroApiKey?.trim() || undefined,
  };
}

function parseParentCollection(value: unknown): string | null {
  if (!value || value === false) return null;
  return String(value);
}

function parseCollection(raw: ZoteroApiObject): ZoteroCollection {
  const data = raw.data;
  return {
    key: String(raw.key),
    name: String(data.name ?? ""),
    parentKey: parseParentCollection(data.parentCollection),
    version: Number(raw.version ?? data.version ?? 0),
  };
}

function formatCreators(creators: unknown): string[] {
  if (!Array.isArray(creators)) return [];
  return creators
    .map((c) => {
      if (!c || typeof c !== "object") return "";
      const row = c as Record<string, unknown>;
      const last = String(row.lastName ?? row.name ?? "").trim();
      const first = String(row.firstName ?? "").trim();
      if (last && first) return `${first} ${last}`;
      return last || first;
    })
    .filter(Boolean);
}

function parseYearFromDate(date?: string): number | null {
  if (!date) return null;
  const match = date.match(/\d{4}/);
  if (!match) return null;
  const year = Number.parseInt(match[0], 10);
  return Number.isFinite(year) ? year : null;
}

function extractArxivFromItemData(data: Record<string, unknown>): string | null {
  const url = String(data.url ?? "");
  const urlMatch = url.match(/arxiv\.org\/abs\/([^/?#]+)/i);
  if (urlMatch) return normalizeArxivId(urlMatch[1]) ?? null;

  const extra = String(data.extra ?? "");
  const extraMatch = extra.match(/arXiv:(\S+)/i);
  if (extraMatch) return normalizeArxivId(extraMatch[1]) ?? null;

  const doi = normalizeDoi(String(data.DOI ?? ""));
  if (doi?.startsWith("10.48550/arxiv.")) {
    return normalizeArxivId(doi.slice("10.48550/arxiv.".length)) ?? null;
  }
  return null;
}

function zoteroCreatorsToAuthorsJson(creators: unknown): string | null {
  if (!Array.isArray(creators) || creators.length === 0) return null;
  const parts = creators
    .filter((c) => {
      if (!c || typeof c !== "object") return false;
      const row = c as Record<string, unknown>;
      const role = String(row.creatorType ?? "author").toLowerCase();
      return role === "author" || !row.creatorType;
    })
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const row = c as Record<string, unknown>;
      const name = String(row.name ?? "").trim();
      if (name) return { name };
      const given = String(row.firstName ?? "").trim();
      const family = String(row.lastName ?? "").trim();
      if (!given && !family) return null;
      return { given, family };
    })
    .filter(Boolean);
  return parts.length ? JSON.stringify(parts) : null;
}

function zoteroCreatorsToEditorsJson(creators: unknown): string | null {
  if (!Array.isArray(creators) || creators.length === 0) return null;
  const parts = creators
    .filter((c) => {
      if (!c || typeof c !== "object") return false;
      return String((c as Record<string, unknown>).creatorType ?? "").toLowerCase() === "editor";
    })
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const row = c as Record<string, unknown>;
      const name = String(row.name ?? "").trim();
      if (name) return { name };
      const given = String(row.firstName ?? "").trim();
      const family = String(row.lastName ?? "").trim();
      if (!given && !family) return null;
      return { given, family };
    })
    .filter(Boolean);
  return parts.length ? JSON.stringify(parts) : null;
}

function stringField(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function parseItemSummary(raw: ZoteroApiObject): ZoteroItemSummary {
  const data = raw.data;
  return {
    key: String(raw.key),
    itemType: String(data.itemType ?? ""),
    title: String(data.title ?? ""),
    version: Number(raw.version ?? data.version ?? 0),
    date: data.date ? String(data.date) : undefined,
    doi: data.DOI ? String(data.DOI) : undefined,
    creators: formatCreators(data.creators),
  };
}

function parseItemRecord(raw: ZoteroApiObject): ZoteroItemRecord {
  const summary = parseItemSummary(raw);
  const data = raw.data;
  const publicationTitle = stringField(data, "publicationTitle");
  const proceedingsTitle = stringField(data, "proceedingsTitle");
  const bookTitle = stringField(data, "bookTitle");
  const venue = publicationTitle ?? proceedingsTitle ?? bookTitle;
  return {
    ...summary,
    abstract: stringField(data, "abstractNote"),
    venue,
    arxivId: extractArxivFromItemData(data),
    authorsJson: zoteroCreatorsToAuthorsJson(data.creators),
    editorsJson: zoteroCreatorsToEditorsJson(data.creators),
    year: parseYearFromDate(summary.date),
    volume: stringField(data, "volume"),
    issue: stringField(data, "issue"),
    pages: stringField(data, "pages"),
    publisher: stringField(data, "publisher"),
    url: stringField(data, "url"),
    language: stringField(data, "language"),
    series: stringField(data, "series"),
    bookTitle,
    proceedingsTitle,
    journalAbbreviation: stringField(data, "journalAbbreviation"),
    isbn: stringField(data, "ISBN"),
  };
}

/** @internal — for unit tests */
export function parseZoteroItemRecordForTests(raw: ZoteroApiObject): ZoteroItemRecord {
  return parseItemRecord(raw);
}

async function zoteroRequest(
  url: string,
  options: RequestInit = {},
  fetchFn: FetchFn = fetch,
): Promise<Response> {
  return fetchFn(url, options);
}

function escapeJsString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function validateZoteroKey(key: string, label: string): void {
  if (!/^[A-Z0-9]{8}$/.test(key)) {
    throw new Error(`Invalid ${label}: ${key}`);
  }
}

function webApiHeaders(creds: ZoteroCredentials): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Zotero-API-Version": "3",
  };
  if (creds.apiKey) headers["Zotero-API-Key"] = creds.apiKey;
  return headers;
}

type CollectionWriteBackend = "bbt" | "web";

export async function resolveCollectionWriteBackend(fetchFn: FetchFn): Promise<{
  backend: CollectionWriteBackend;
  creds: ZoteroCredentials;
}> {
  const creds = credentialsFromSettings();
  const localReachable = await probeLocalZotero(fetchFn);
  const debugBridge = localReachable && (await probeBbtDebugBridge(fetchFn));
  const webReachable = await probeWebZotero(creds, fetchFn);

  if (debugBridge) return { backend: "bbt", creds };
  if (webReachable) return { backend: "web", creds };

  if (localReachable) {
    throw new Error(
      "Zotero's local /api/ is read-only. For collection edits: add User ID + API key in Settings → Zotero (recommended), or install the separate debug-bridge add-on (not bundled with Better BibTeX).",
    );
  }
  throw new Error(
    "Zotero is not reachable. Start Zotero desktop or configure Web API credentials in Settings → Zotero.",
  );
}

const DEBUG_BRIDGE_HEADERS: Record<string, string> = {
  "Content-Type": "text/plain",
  "User-Agent": "PrismNext/1.0",
};

async function executeBbtDebugBridge(jsBody: string, fetchFn: FetchFn): Promise<string> {
  const res = await zoteroRequest(
    `${ZOTERO_LOCAL_BASE}/debug-bridge/execute`,
    {
      method: "POST",
      headers: DEBUG_BRIDGE_HEADERS,
      body: jsBody,
    },
    fetchFn,
  );
  if (res.status === 404) {
    throw new Error(
      "Zotero debug-bridge plugin is not installed. Better BibTeX alone does not provide it — use Web API credentials in Settings, or install the separate debug-bridge add-on from the BBT releases page.",
    );
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zotero debug-bridge error (${res.status}): ${body}`);
  }
  return await res.text();
}

function parseDebugBridgeJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid debug-bridge response: ${raw.slice(0, 200)}`);
  }
}

function parseWriteResponseKey(response: unknown): { key: string; version: number } {
  if (!response || typeof response !== "object") {
    throw new Error("Invalid Zotero write response");
  }
  const obj = response as {
    successful?: Record<
      string,
      { key?: string; version?: number; data?: { key?: string; version?: number } }
    >;
  };
  const first = Object.values(obj.successful ?? {})[0];
  if (!first) throw new Error("Zotero did not create the collection");
  const key = first.key ?? first.data?.key;
  const version = Number(first.version ?? first.data?.version ?? 0);
  if (!key) throw new Error("Zotero did not return a collection key");
  return { key, version };
}

async function fetchWebCollection(
  creds: ZoteroCredentials,
  collectionKey: string,
  fetchFn: FetchFn,
): Promise<ZoteroApiObject> {
  if (!creds.userId) throw new Error("Zotero User ID is required for Web API writes.");
  const res = await zoteroRequest(
    `${ZOTERO_WEB_BASE}/users/${creds.userId}/collections/${collectionKey}`,
    { method: "GET", headers: webApiHeaders(creds) },
    fetchFn,
  );
  if (!res.ok) {
    throw new Error(`Failed to load collection: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ZoteroApiObject;
}

export async function probeLocalZotero(fetchFn: FetchFn = fetch): Promise<boolean> {
  try {
    const res = await zoteroRequest(
      `${ZOTERO_LOCAL_BASE}/api/users/0/items?limit=1`,
      { method: "GET" },
      fetchFn,
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function probeBetterBibTeX(fetchFn: FetchFn = fetch): Promise<boolean> {
  try {
    const res = await zoteroRequest(
      `${ZOTERO_LOCAL_BASE}/better-bibtex/cayw?probe=true`,
      { method: "GET" },
      fetchFn,
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** BBT debug-bridge — local collection CRUD without Web API credentials. */
export async function probeBbtDebugBridge(fetchFn: FetchFn = fetch): Promise<boolean> {
  try {
    const res = await zoteroRequest(
      `${ZOTERO_LOCAL_BASE}/debug-bridge/execute`,
      {
        method: "POST",
        headers: DEBUG_BRIDGE_HEADERS,
        body: "return 'ok';",
      },
      fetchFn,
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function probeWebZotero(
  creds: ZoteroCredentials,
  fetchFn: FetchFn = fetch,
): Promise<boolean> {
  if (!creds.userId || !creds.apiKey) return false;
  try {
    const res = await zoteroRequest(
      `${ZOTERO_WEB_BASE}/users/${creds.userId}/collections?limit=1`,
      {
        method: "GET",
        headers: {
          "Zotero-API-Key": creds.apiKey,
        },
      },
      fetchFn,
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function getZoteroStatus(fetchFn: FetchFn = fetch): Promise<ZoteroStatus> {
  const creds = credentialsFromSettings();
  const localReachable = await probeLocalZotero(fetchFn);
  const bbtInstalled = localReachable ? await probeBetterBibTeX(fetchFn) : false;
  const bbtDebugBridge = localReachable ? await probeBbtDebugBridge(fetchFn) : false;
  const webReachable = await probeWebZotero(creds, fetchFn);

  if (bbtInstalled) {
    updateSettings({ zoteroLastBBTDetected: true });
  }

  let mode: ZoteroConnectionMode = "offline";
  if (localReachable) mode = "local";
  else if (webReachable) mode = "web";

  let error: string | undefined;
  if (mode === "offline") {
    if (!creds.userId || !creds.apiKey) {
      error = "Start Zotero desktop or add User ID and API key in Settings → Zotero.";
    } else {
      error = "Zotero desktop is not running and web API is unreachable.";
    }
  }

  return {
    mode,
    localReachable,
    bbtInstalled,
    bbtDebugBridge,
    webReachable,
    userId: creds.userId,
    error,
  };
}

async function readJsonArray<T>(
  url: string,
  headers: Record<string, string>,
  fetchFn: FetchFn,
): Promise<T[]> {
  const res = await zoteroRequest(url, { method: "GET", headers }, fetchFn);
  if (!res.ok) {
    throw new Error(`Zotero API ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data as T[];
}

const ZOTERO_LIST_PAGE_LIMIT = 100;

function paginatedZoteroListUrl(baseUrl: string, start: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set("limit", String(ZOTERO_LIST_PAGE_LIMIT));
  url.searchParams.set("start", String(start));
  return url.toString();
}

/** Fetch all pages — Zotero defaults to limit=25 without pagination. */
async function readJsonArrayAllPages<T>(
  baseUrl: string,
  headers: Record<string, string>,
  fetchFn: FetchFn,
): Promise<T[]> {
  const all: T[] = [];
  let start = 0;
  while (true) {
    const res = await zoteroRequest(
      paginatedZoteroListUrl(baseUrl, start),
      { method: "GET", headers },
      fetchFn,
    );
    if (!res.ok) {
      throw new Error(`Zotero API ${res.status}: ${res.statusText}`);
    }
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) break;
    const page = data as T[];
    all.push(...page);
    if (page.length < ZOTERO_LIST_PAGE_LIMIT) break;
    start += ZOTERO_LIST_PAGE_LIMIT;
  }
  return all;
}

export async function listZoteroCollections(fetchFn: FetchFn = fetch): Promise<ZoteroCollection[]> {
  const creds = credentialsFromSettings();
  const localReachable = await probeLocalZotero(fetchFn);

  const raw = localReachable
    ? await readJsonArray<ZoteroApiObject>(
        `${ZOTERO_LOCAL_BASE}/api/users/0/collections`,
        {},
        fetchFn,
      )
    : creds.userId && creds.apiKey
      ? await readJsonArray<ZoteroApiObject>(
          `${ZOTERO_WEB_BASE}/users/${creds.userId}/collections`,
          { "Zotero-API-Key": creds.apiKey },
          fetchFn,
        )
      : [];

  if (!raw.length && !localReachable && !creds.userId) {
    throw new Error("Zotero is not reachable. Start Zotero desktop or configure API credentials.");
  }

  return raw.map(parseCollection).sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchZoteroCollection(
  collectionKey: string,
  fetchFn: FetchFn = fetch,
): Promise<ZoteroCollection | null> {
  const creds = credentialsFromSettings();
  const localReachable = await probeLocalZotero(fetchFn);

  const url = localReachable
    ? `${ZOTERO_LOCAL_BASE}/api/users/0/collections/${collectionKey}`
    : creds.userId && creds.apiKey
      ? `${ZOTERO_WEB_BASE}/users/${creds.userId}/collections/${collectionKey}`
      : null;

  if (!url) return null;

  const headers: Record<string, string> = {};
  if (!localReachable && creds.apiKey) {
    headers["Zotero-API-Key"] = creds.apiKey;
  }

  const res = await zoteroRequest(url, { method: "GET", headers }, fetchFn);
  if (!res.ok) return null;
  return parseCollection((await res.json()) as ZoteroApiObject);
}

export async function listCollectionItems(
  collectionKey: string,
  fetchFn: FetchFn = fetch,
): Promise<ZoteroItemSummary[]> {
  const creds = credentialsFromSettings();
  const localReachable = await probeLocalZotero(fetchFn);

  const url = localReachable
    ? `${ZOTERO_LOCAL_BASE}/api/users/0/collections/${collectionKey}/items`
    : creds.userId && creds.apiKey
      ? `${ZOTERO_WEB_BASE}/users/${creds.userId}/collections/${collectionKey}/items`
      : null;

  if (!url) {
    throw new Error("Zotero is not reachable.");
  }

  const headers: Record<string, string> = {};
  if (!localReachable && creds.apiKey) {
    headers["Zotero-API-Key"] = creds.apiKey;
  }

  const raw = await readJsonArrayAllPages<ZoteroApiObject>(url, headers, fetchFn);
  return raw
    .map(parseItemSummary)
    .filter((item) => item.itemType !== "attachment" && item.itemType !== "note");
}

export async function listCollectionItemRecords(
  collectionKey: string,
  fetchFn: FetchFn = fetch,
): Promise<ZoteroItemRecord[]> {
  const creds = credentialsFromSettings();
  const localReachable = await probeLocalZotero(fetchFn);

  const url = localReachable
    ? `${ZOTERO_LOCAL_BASE}/api/users/0/collections/${collectionKey}/items`
    : creds.userId && creds.apiKey
      ? `${ZOTERO_WEB_BASE}/users/${creds.userId}/collections/${collectionKey}/items`
      : null;

  if (!url) {
    throw new Error("Zotero is not reachable.");
  }

  const headers: Record<string, string> = {};
  if (!localReachable && creds.apiKey) {
    headers["Zotero-API-Key"] = creds.apiKey;
  }

  const raw = await readJsonArrayAllPages<ZoteroApiObject>(url, headers, fetchFn);
  return raw
    .map(parseItemRecord)
    .filter((item) => item.itemType !== "attachment" && item.itemType !== "note");
}

/** Root collection plus every nested subcollection key (depth-first order). */
export function collectDescendantCollectionKeys(
  rootKey: string,
  collections: readonly ZoteroCollection[],
): string[] {
  const childrenByParent = new Map<string, ZoteroCollection[]>();
  for (const col of collections) {
    if (!col.parentKey) continue;
    const siblings = childrenByParent.get(col.parentKey) ?? [];
    siblings.push(col);
    childrenByParent.set(col.parentKey, siblings);
  }

  const keys: string[] = [];
  const queue = [rootKey];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const key = queue.shift()!;
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
    for (const child of childrenByParent.get(key) ?? []) {
      queue.push(child.key);
    }
  }
  return keys;
}

/** Items in the bound collection and all nested subcollections (deduped by item key). */
export async function listCollectionTreeItemRecords(
  rootCollectionKey: string,
  fetchFn: FetchFn = fetch,
): Promise<ZoteroItemRecord[]> {
  const collections = await listZoteroCollections(fetchFn);
  const collectionKeys = collectDescendantCollectionKeys(rootCollectionKey, collections);
  const byItemKey = new Map<string, ZoteroItemRecord>();
  for (const collectionKey of collectionKeys) {
    const items = await listCollectionItemRecords(collectionKey, fetchFn);
    for (const item of items) {
      byItemKey.set(item.key, item);
    }
  }
  return [...byItemKey.values()];
}

/**
 * Find a top-level Zotero item by DOI or arXiv ID across the whole library
 * (not scoped to a collection). Used by the enrich pipeline to short-circuit
 * catalog lookups when the user already has the paper in Zotero — preferring
 * the Zotero mirror over a duplicate Crossref-sourced local row.
 *
 * Returns null when Zotero is not reachable or no match is found.
 */
export async function findZoteroItemByIdentifier(
  query: { doi?: string; arxivId?: string },
  fetchFn: FetchFn = fetch,
): Promise<ZoteroItemRecord | null> {
  const localReachable = await probeLocalZotero(fetchFn);
  if (!localReachable) return null;

  const normDoi = query.doi ? normalizeDoi(query.doi) : null;
  const normArxiv = query.arxivId ? normalizeArxivId(query.arxivId) : null;
  if (!normDoi && !normArxiv) return null;

  const searchTerms = [normDoi, normArxiv].filter(Boolean) as string[];
  for (const term of searchTerms) {
    const url = `${ZOTERO_LOCAL_BASE}/api/users/0/items?q=${encodeURIComponent(term)}&format=json&limit=50`;
    try {
      const raw = await readJsonArray<ZoteroApiObject>(url, {}, fetchFn);
      const records = raw
        .map(parseItemRecord)
        .filter((item) => item.itemType !== "attachment" && item.itemType !== "note");
      for (const item of records) {
        const itemDoi = item.doi ? normalizeDoi(item.doi) : null;
        const itemArxiv = item.arxivId ? normalizeArxivId(item.arxivId) : null;
        if (normDoi && itemDoi === normDoi) return item;
        if (normArxiv && itemArxiv === normArxiv) return item;
      }
    } catch {
      // try next term / fall through
    }
  }
  return null;
}

export async function getZoteroItem(
  itemKey: string,
  fetchFn: FetchFn = fetch,
): Promise<ZoteroItemSummary | null> {
  const creds = credentialsFromSettings();
  const localReachable = await probeLocalZotero(fetchFn);

  const url = localReachable
    ? `${ZOTERO_LOCAL_BASE}/api/users/0/items/${itemKey}`
    : creds.userId && creds.apiKey
      ? `${ZOTERO_WEB_BASE}/users/${creds.userId}/items/${itemKey}`
      : null;

  if (!url) return null;

  const headers: Record<string, string> = {};
  if (!localReachable && creds.apiKey) {
    headers["Zotero-API-Key"] = creds.apiKey;
  }

  const res = await zoteroRequest(url, { method: "GET", headers }, fetchFn);
  if (!res.ok) return null;
  const raw = (await res.json()) as ZoteroApiObject;
  return parseItemSummary(raw);
}

export async function getItemPdfAttachmentKey(
  itemKey: string,
  fetchFn: FetchFn = fetch,
): Promise<string | null> {
  const creds = credentialsFromSettings();
  const localReachable = await probeLocalZotero(fetchFn);

  const url = localReachable
    ? `${ZOTERO_LOCAL_BASE}/api/users/0/items/${itemKey}/children`
    : creds.userId && creds.apiKey
      ? `${ZOTERO_WEB_BASE}/users/${creds.userId}/items/${itemKey}/children`
      : null;

  if (!url) return null;

  const headers: Record<string, string> = {};
  if (!localReachable && creds.apiKey) {
    headers["Zotero-API-Key"] = creds.apiKey;
  }

  const children = await readJsonArray<ZoteroApiObject>(url, headers, fetchFn);
  for (const child of children) {
    const data = child.data;
    if (data.itemType === "attachment" && data.contentType === "application/pdf") {
      return String(child.key);
    }
  }
  return null;
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 4).toString("ascii") === "%PDF";
}

function readPdfFromFilesystemPath(filePath: string): Uint8Array | null {
  try {
    const normalized = filePath.startsWith("file:")
      ? fileURLToPath(filePath)
      : filePath;
    if (!fs.existsSync(normalized)) return null;
    const buf = fs.readFileSync(normalized);
    if (!isPdfBuffer(buf)) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

const ZOTERO_PDF_FETCH_TIMEOUT_MS = 120_000;
const ZOTERO_LOCAL_PDF_PROBE_TIMEOUT_MS = 8_000;

export type PdfDownloadProgressCallback = (info: {
  receivedBytes: number;
  totalBytes: number | null;
}) => void;

async function readResponseBodyWithProgress(
  res: Response,
  onProgress?: PdfDownloadProgressCallback,
  options?: { incremental?: boolean },
): Promise<Uint8Array | null> {
  const incremental = options?.incremental ?? true;
  const totalHeader = res.headers.get("content-length");
  const parsedTotal = totalHeader ? Number.parseInt(totalHeader, 10) : NaN;
  const totalBytes = Number.isFinite(parsedTotal) ? parsedTotal : null;

  const reader = res.body?.getReader();
  if (!reader) {
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 5) {
      onProgress?.({ receivedBytes: bytes.length, totalBytes: bytes.length });
      return bytes;
    }
    return null;
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      chunks.push(value);
      received += value.length;
      if (incremental) {
        onProgress?.({ receivedBytes: received, totalBytes });
      }
    }
    if (done) break;
  }

  if (received < 5) return null;
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (!incremental) {
    onProgress?.({ receivedBytes: received, totalBytes: received });
  }
  return bytes;
}

async function fetchWebPdfBytes(
  attachmentKey: string,
  creds: ZoteroCredentials,
  fetchFn: FetchFn,
  onProgress?: PdfDownloadProgressCallback,
): Promise<Uint8Array | null> {
  if (!creds.userId || !creds.apiKey) return null;
  try {
    const res = await zoteroRequest(
      `${ZOTERO_WEB_BASE}/users/${creds.userId}/items/${attachmentKey}/file`,
      {
        method: "GET",
        headers: { "Zotero-API-Key": creds.apiKey },
        signal: AbortSignal.timeout(ZOTERO_PDF_FETCH_TIMEOUT_MS),
      },
      fetchFn,
    );
    if (!res.ok) return null;
    return await readResponseBodyWithProgress(res, onProgress);
  } catch {
    return null;
  }
}

async function fetchLocalPdfBytes(
  attachmentKey: string,
  fetchFn: FetchFn,
  onProgress?: PdfDownloadProgressCallback,
): Promise<Uint8Array | null> {
  // Fast paths first — only report progress on success so a failed probe does not
  // leave partial bytes that get reset when Web API fallback starts.
  try {
    const itemRes = await zoteroRequest(
      `${ZOTERO_LOCAL_BASE}/api/users/0/items/${attachmentKey}`,
      {
        method: "GET",
        signal: AbortSignal.timeout(ZOTERO_LOCAL_PDF_PROBE_TIMEOUT_MS),
      },
      fetchFn,
    );
    if (itemRes.ok) {
      const item = (await itemRes.json()) as ZoteroApiObject;
      const data = item.data as Record<string, unknown>;
      const linkMode = String(data.linkMode ?? "");
      if (linkMode === "linked_file" || linkMode === "imported_file") {
        const pathField = data.path ?? data.filename;
        if (typeof pathField === "string" && pathField.trim()) {
          const fromMeta = readPdfFromFilesystemPath(pathField.trim());
          if (fromMeta) {
            onProgress?.({ receivedBytes: fromMeta.length, totalBytes: fromMeta.length });
            return fromMeta;
          }
        }
      }
    }
  } catch {
    // fall through
  }

  const fileUrl = `${ZOTERO_LOCAL_BASE}/api/users/0/items/${attachmentKey}/file`;
  try {
    const res = await zoteroRequest(
      fileUrl,
      {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(ZOTERO_PDF_FETCH_TIMEOUT_MS),
      },
      fetchFn,
    );

    if (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307) {
      const location = res.headers.get("Location");
      if (location) {
        const fromDisk = readPdfFromFilesystemPath(location);
        if (fromDisk) {
          onProgress?.({ receivedBytes: fromDisk.length, totalBytes: fromDisk.length });
          return fromDisk;
        }
      }
    }

    if (res.ok) {
      // Local stream is last resort — defer incremental updates until the full body is read.
      return await readResponseBodyWithProgress(res, onProgress, { incremental: false });
    }
  } catch {
    return null;
  }

  return null;
}

export async function fetchItemPdfBytes(
  attachmentKey: string,
  fetchFn: FetchFn = fetch,
  onProgress?: PdfDownloadProgressCallback,
): Promise<Uint8Array | null> {
  const creds = credentialsFromSettings();
  const localReachable = await probeLocalZotero(fetchFn);

  // Local Zotero already has files on disk — much faster than Web API round-trip.
  if (localReachable) {
    const localBytes = await fetchLocalPdfBytes(attachmentKey, fetchFn, onProgress);
    if (localBytes) return localBytes;
  }

  return await fetchWebPdfBytes(attachmentKey, creds, fetchFn, onProgress);
}

export async function createZoteroCollection(
  name: string,
  parentKey?: string | null,
  fetchFn: FetchFn = fetch,
): Promise<ZoteroCollection> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Collection name is required");

  const { backend, creds } = await resolveCollectionWriteBackend(fetchFn);

  if (backend === "bbt") {
    const escapedName = escapeJsString(trimmed);
    let jsCode: string;
    if (parentKey) {
      validateZoteroKey(parentKey, "parent collection key");
      const escapedParent = escapeJsString(parentKey);
      jsCode = `
var parent = await Zotero.Collections.getByLibraryAndKeyAsync(
  Zotero.Libraries.userLibraryID, '${escapedParent}'
);
if (!parent) throw new Error('Parent collection not found: ${escapedParent}');
var col = new Zotero.Collection();
col.libraryID = Zotero.Libraries.userLibraryID;
col.name = '${escapedName}';
col.parentID = parent.id;
await col.saveTx();
return JSON.stringify({ key: col.key, name: col.name, parentKey: '${escapedParent}', version: col.version });
`;
    } else {
      jsCode = `
var col = new Zotero.Collection();
col.libraryID = Zotero.Libraries.userLibraryID;
col.name = '${escapedName}';
await col.saveTx();
return JSON.stringify({ key: col.key, name: col.name, parentKey: null, version: col.version });
`;
    }
    const raw = await executeBbtDebugBridge(jsCode, fetchFn);
    const result = parseDebugBridgeJson<{
      key: string;
      name: string;
      parentKey?: string | null;
      version?: number;
    }>(raw);
    return {
      key: result.key,
      name: result.name,
      parentKey: result.parentKey ?? null,
      version: Number(result.version ?? 0),
    };
  }

  if (!creds.userId) throw new Error("Zotero User ID is required for Web API writes.");
  const payload = parentKey
    ? [{ name: trimmed, parentCollection: parentKey }]
    : [{ name: trimmed }];
  const res = await zoteroRequest(
    `${ZOTERO_WEB_BASE}/users/${creds.userId}/collections`,
    {
      method: "POST",
      headers: webApiHeaders(creds),
      body: JSON.stringify(payload),
    },
    fetchFn,
  );
  if (!res.ok) {
    throw new Error(`Failed to create collection: ${res.status} ${res.statusText}`);
  }
  const { key, version } = parseWriteResponseKey(await res.json());
  return {
    key,
    name: trimmed,
    parentKey: parentKey ?? null,
    version,
  };
}

export async function renameZoteroCollection(
  collectionKey: string,
  name: string,
  fetchFn: FetchFn = fetch,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Collection name is required");
  validateZoteroKey(collectionKey, "collection key");

  const { backend, creds } = await resolveCollectionWriteBackend(fetchFn);

  if (backend === "bbt") {
    const escapedName = escapeJsString(trimmed);
    const escapedKey = escapeJsString(collectionKey);
    const jsCode = `
var col = await Zotero.Collections.getByLibraryAndKeyAsync(
  Zotero.Libraries.userLibraryID, '${escapedKey}'
);
if (!col) throw new Error('Collection not found: ${escapedKey}');
col.name = '${escapedName}';
await col.saveTx();
return JSON.stringify({ ok: true });
`;
    await executeBbtDebugBridge(jsCode, fetchFn);
    return;
  }

  const existing = await fetchWebCollection(creds, collectionKey, fetchFn);
  const version = Number(existing.version ?? existing.data.version ?? 0);
  const parentCollection = existing.data.parentCollection ?? false;
  const res = await zoteroRequest(
    `${ZOTERO_WEB_BASE}/users/${creds.userId}/collections/${collectionKey}`,
    {
      method: "PUT",
      headers: {
        ...webApiHeaders(creds),
        "If-Unmodified-Since-Version": String(version),
      },
      body: JSON.stringify({
        key: collectionKey,
        version,
        name: trimmed,
        parentCollection,
      }),
    },
    fetchFn,
  );
  if (!res.ok) {
    throw new Error(`Failed to rename collection: ${res.status} ${res.statusText}`);
  }
}

export async function deleteZoteroCollection(
  collectionKey: string,
  fetchFn: FetchFn = fetch,
): Promise<void> {
  validateZoteroKey(collectionKey, "collection key");
  const { backend, creds } = await resolveCollectionWriteBackend(fetchFn);

  if (backend === "bbt") {
    const escapedKey = escapeJsString(collectionKey);
    const jsCode = `
var col = await Zotero.Collections.getByLibraryAndKeyAsync(
  Zotero.Libraries.userLibraryID, '${escapedKey}'
);
if (!col) throw new Error('Collection not found: ${escapedKey}');
await col.eraseTx();
return JSON.stringify({ deleted: true });
`;
    await executeBbtDebugBridge(jsCode, fetchFn);
    return;
  }

  const existing = await fetchWebCollection(creds, collectionKey, fetchFn);
  const version = Number(existing.version ?? existing.data.version ?? 0);
  const res = await zoteroRequest(
    `${ZOTERO_WEB_BASE}/users/${creds.userId}/collections/${collectionKey}`,
    {
      method: "DELETE",
      headers: {
        ...webApiHeaders(creds),
        "If-Unmodified-Since-Version": String(version),
      },
    },
    fetchFn,
  );
  if (!res.ok) {
    throw new Error(`Failed to delete collection: ${res.status} ${res.statusText}`);
  }
}

export async function addItemsToZoteroCollection(
  collectionKey: string,
  itemKeys: string[],
  fetchFn: FetchFn = fetch,
): Promise<void> {
  if (!itemKeys.length) return;
  validateZoteroKey(collectionKey, "collection key");
  for (const key of itemKeys) validateZoteroKey(key, "item key");

  const { backend, creds } = await resolveCollectionWriteBackend(fetchFn);

  if (backend === "bbt") {
    const escapedCol = escapeJsString(collectionKey);
    const escapedKeys = itemKeys.map((k) => `'${escapeJsString(k)}'`).join(", ");
    const jsCode = `
var col = await Zotero.Collections.getByLibraryAndKeyAsync(
  Zotero.Libraries.userLibraryID, '${escapedCol}'
);
if (!col) throw new Error('Collection not found: ${escapedCol}');
var keys = [${escapedKeys}];
for (var key of keys) {
  var item = await Zotero.Items.getByLibraryAndKeyAsync(Zotero.Libraries.userLibraryID, key);
  if (!item) continue;
  item.addToCollection(col.id);
  await item.saveTx();
}
return JSON.stringify({ added: keys.length });
`;
    await executeBbtDebugBridge(jsCode, fetchFn);
    return;
  }

  const res = await zoteroRequest(
    `${ZOTERO_WEB_BASE}/users/${creds.userId}/collections/${collectionKey}/items`,
    {
      method: "POST",
      headers: {
        ...webApiHeaders(creds),
        "Content-Type": "text/plain",
      },
      body: itemKeys.join(" "),
    },
    fetchFn,
  );
  if (!res.ok) {
    throw new Error(`Failed to add items to collection: ${res.status} ${res.statusText}`);
  }
}

export async function removeItemFromZoteroCollection(
  collectionKey: string,
  itemKey: string,
  fetchFn: FetchFn = fetch,
): Promise<void> {
  validateZoteroKey(collectionKey, "collection key");
  validateZoteroKey(itemKey, "item key");

  const { backend, creds } = await resolveCollectionWriteBackend(fetchFn);

  if (backend === "bbt") {
    const escapedCol = escapeJsString(collectionKey);
    const escapedItem = escapeJsString(itemKey);
    const jsCode = `
var col = await Zotero.Collections.getByLibraryAndKeyAsync(
  Zotero.Libraries.userLibraryID, '${escapedCol}'
);
if (!col) throw new Error('Collection not found: ${escapedCol}');
var item = await Zotero.Items.getByLibraryAndKeyAsync(
  Zotero.Libraries.userLibraryID, '${escapedItem}'
);
if (!item) throw new Error('Item not found: ${escapedItem}');
item.removeFromCollection(col.id);
await item.saveTx();
return JSON.stringify({ removed: true });
`;
    await executeBbtDebugBridge(jsCode, fetchFn);
    return;
  }

  const res = await zoteroRequest(
    `${ZOTERO_WEB_BASE}/users/${creds.userId}/collections/${collectionKey}/items/${itemKey}`,
    { method: "DELETE", headers: webApiHeaders(creds) },
    fetchFn,
  );
  if (!res.ok) {
    throw new Error(`Failed to remove item from collection: ${res.status} ${res.statusText}`);
  }
}

export async function resolveCitekeys(
  itemKeys: string[],
  fetchFn: FetchFn = fetch,
): Promise<Record<string, string>> {
  const bibliographies = await resolveItemBibliographies(itemKeys, fetchFn);
  const result: Record<string, string> = {};
  for (const key of itemKeys) {
    result[key] = bibliographies[key]?.citekey ?? key;
  }
  return result;
}

export interface ZoteroItemBibliography {
  citekey: string;
  rawBibtex: string | null;
}

export async function resolveItemBibliographies(
  itemKeys: string[],
  fetchFn: FetchFn = fetch,
): Promise<Record<string, ZoteroItemBibliography>> {
  const result: Record<string, ZoteroItemBibliography> = {};
  if (itemKeys.length === 0) return result;

  const bbt = await probeBetterBibTeX(fetchFn);
  const localReachable = bbt ? false : await probeLocalZotero(fetchFn);
  const concurrency = Math.min(8, itemKeys.length);
  let nextIndex = 0;

  async function resolveOne(key: string): Promise<void> {
    if (bbt) {
      try {
        const res = await zoteroRequest(
          `${ZOTERO_LOCAL_BASE}/better-bibtex/json-rpc`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "item.export",
              params: [key, "betterbibtex"],
              id: 1,
            }),
          },
          fetchFn,
        );
        if (res.ok) {
          const json = (await res.json()) as { result?: string };
          const bib = json.result?.trim() ?? "";
          const match = bib.match(/@\w+\{([^,]+),/);
          result[key] = { citekey: match?.[1] ?? key, rawBibtex: bib || null };
          return;
        }
      } catch {
        // fall through to bibtex
      }
    }

    let bib: string | null = null;
    if (localReachable) {
      try {
        const res = await zoteroRequest(
          `${ZOTERO_LOCAL_BASE}/api/users/0/items/${key}?format=bibtex`,
          { method: "GET" },
          fetchFn,
        );
        if (res.ok) bib = (await res.text()).trim();
      } catch {
        // ignore
      }
    }
    const citekeyMatch = bib?.match(/@\w+\{([^,]+),/);
    result[key] = { citekey: citekeyMatch?.[1] ?? key, rawBibtex: bib };
  }

  async function worker(): Promise<void> {
    while (nextIndex < itemKeys.length) {
      const key = itemKeys[nextIndex++];
      await resolveOne(key);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return result;
}

export async function exportBibTeX(
  itemKeys: string[],
  format: "better-bibtex" | "bibtex" = "bibtex",
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const localReachable = await probeLocalZotero(fetchFn);
  if (!localReachable) {
    throw new Error("Export requires Zotero desktop to be running.");
  }

  const parts: string[] = [];
  for (const key of itemKeys) {
    if (format === "better-bibtex" && (await probeBetterBibTeX(fetchFn))) {
      const res = await zoteroRequest(
        `${ZOTERO_LOCAL_BASE}/better-bibtex/json-rpc`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "item.export",
            params: [key, "betterbibtex"],
            id: 1,
          }),
        },
        fetchFn,
      );
      if (res.ok) {
        const json = (await res.json()) as { result?: string };
        if (json.result) parts.push(json.result.trim());
        continue;
      }
    }

    const res = await zoteroRequest(
      `${ZOTERO_LOCAL_BASE}/api/users/0/items/${key}?format=bibtex`,
      { method: "GET" },
      fetchFn,
    );
    if (res.ok) {
      parts.push((await res.text()).trim());
    }
  }

  return parts.filter(Boolean).join("\n\n");
}
