import * as fs from "node:fs";
import * as path from "node:path";
import type { PaperExtractBlock } from "../../shared/literature/paper-extract-block";
import { parseMineruZipBuffer, type MineruZipImageAsset } from "./mineru-zip";

const MINERU_BASE = "https://mineru.net";

export interface MineruExtractResult {
  markdown: string;
  pageCount: number;
  mode: "precision" | "flash";
  remoteJobId: string;
  /** Populated for precision (zip) extracts only. */
  images?: MineruZipImageAsset[];
  /** Layout blocks from content_list.json (precision zip only). */
  blocks?: PaperExtractBlock[];
  /** Raw middle/model JSON for block region upgrades on read. */
  layout?: { middle?: unknown; model?: unknown };
}

interface MineruApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

async function downloadMarkdownFromZipUrl(zipUrl: string): Promise<MineruExtractResult> {
  const res = await fetch(zipUrl);
  if (!res.ok) throw new Error(`MinerU zip download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const parsed = await parseMineruZipBuffer(buf);
  return {
    markdown: parsed.markdown,
    pageCount: 0,
    mode: "precision",
    remoteJobId: "",
    images: parsed.images,
    blocks: parsed.blocks,
    layout: parsed.layout,
  };
}

export type MineruProgressCallback = (info: {
  stage: "upload" | "processing";
  message: string;
}) => void;

async function pollBatchResult(
  token: string,
  batchId: string,
  onProgress?: MineruProgressCallback,
  signal?: AbortSignal,
): Promise<{ markdown: string; pageCount: number; taskId: string; images?: MineruZipImageAsset[]; blocks?: PaperExtractBlock[]; layout?: { middle?: unknown; model?: unknown } }> {
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("MinerU extraction cancelled");
    onProgress?.({
      stage: "processing",
      message: "MinerU processing (cloud)…",
    });
    const res = await fetch(`${MINERU_BASE}/api/v4/extract-results/batch/${batchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as MineruApiResponse<{
      extract_result?: Array<{
        state: string;
        full_zip_url?: string;
        err_msg?: string;
        extract_progress?: { total_pages?: number };
      }>;
    }>;
    if (body.code !== 0) throw new Error(body.msg || "MinerU batch query failed");
    const item = body.data.extract_result?.[0];
    if (!item) {
      await delay(3000, signal);
      continue;
    }
    if (item.state === "done" && item.full_zip_url) {
      const parsed = await downloadMarkdownFromZipUrl(item.full_zip_url);
      return {
        markdown: parsed.markdown,
        pageCount: item.extract_progress?.total_pages ?? 0,
        taskId: batchId,
        images: parsed.images,
        blocks: parsed.blocks,
        layout: parsed.layout,
      };
    }
    if (item.state === "failed") {
      throw new Error(item.err_msg || "MinerU batch extraction failed");
    }
    await delay(3000, signal);
  }
  throw new Error("MinerU batch extraction timed out");
}

async function pollFlashTask(
  taskId: string,
  onProgress?: MineruProgressCallback,
  signal?: AbortSignal,
): Promise<{ markdown: string; pageCount: number }> {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("MinerU flash extraction cancelled");
    onProgress?.({
      stage: "processing",
      message: "MinerU flash processing…",
    });
    const res = await fetch(`${MINERU_BASE}/api/v1/agent/parse/${taskId}`);
    const body = (await res.json()) as MineruApiResponse<{
      state: string;
      markdown_url?: string;
      err_msg?: string;
    }>;
    if (body.code !== 0) throw new Error(body.msg || "MinerU flash query failed");
    const data = body.data;
    if (data.state === "done" && data.markdown_url) {
      const mdRes = await fetch(data.markdown_url);
      if (!mdRes.ok) throw new Error(`MinerU markdown download failed (${mdRes.status})`);
      const markdown = await mdRes.text();
      return { markdown, pageCount: 0 };
    }
    if (data.state === "failed") {
      throw new Error(data.err_msg || "MinerU flash extraction failed");
    }
    await delay(2500, signal);
  }
  throw new Error("MinerU flash extraction timed out");
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("cancelled"));
      },
      { once: true },
    );
  });
}

export async function extractWithMineruPrecisionUpload(
  token: string,
  pdfAbsPath: string,
  onProgress?: MineruProgressCallback,
  signal?: AbortSignal,
): Promise<MineruExtractResult> {
  const fileName = path.basename(pdfAbsPath);
  const res = await fetch(`${MINERU_BASE}/api/v4/file-urls/batch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: [{ name: fileName, data_id: `prism-${Date.now()}` }],
      model_version: "vlm",
    }),
  });
  const body = (await res.json()) as MineruApiResponse<{
    batch_id: string;
    file_urls: string[];
  }>;
  if (body.code !== 0) throw new Error(body.msg || "MinerU upload URL request failed");
  const uploadUrl = body.data.file_urls[0];
  if (!uploadUrl) throw new Error("MinerU returned no upload URL");

  const pdfBytes = await fs.promises.readFile(pdfAbsPath);
  onProgress?.({ stage: "upload", message: "Uploading PDF to MinerU…" });
  const uploadRes = await fetch(uploadUrl, { method: "PUT", body: pdfBytes });
  if (!uploadRes.ok) throw new Error(`MinerU PDF upload failed (${uploadRes.status})`);

  const result = await pollBatchResult(token, body.data.batch_id, onProgress, signal);
  return {
    markdown: result.markdown,
    pageCount: result.pageCount,
    mode: "precision",
    remoteJobId: result.taskId,
    images: result.images,
    blocks: result.blocks,
    layout: result.layout,
  };
}

export async function extractWithMineruFlashUpload(
  pdfAbsPath: string,
  onProgress?: MineruProgressCallback,
  signal?: AbortSignal,
): Promise<MineruExtractResult> {
  const fileName = path.basename(pdfAbsPath);
  const createRes = await fetch(`${MINERU_BASE}/api/v1/agent/parse/file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: fileName, language: "en", enable_table: true }),
  });
  const createBody = (await createRes.json()) as MineruApiResponse<{
    task_id: string;
    file_url: string;
  }>;
  if (createBody.code !== 0) throw new Error(createBody.msg || "MinerU flash task create failed");

  const pdfBytes = await fs.promises.readFile(pdfAbsPath);
  onProgress?.({ stage: "upload", message: "Uploading PDF to MinerU (flash)…" });
  const uploadRes = await fetch(createBody.data.file_url, { method: "PUT", body: pdfBytes });
  if (!uploadRes.ok) throw new Error(`MinerU flash upload failed (${uploadRes.status})`);

  const polled = await pollFlashTask(createBody.data.task_id, onProgress, signal);
  return {
    markdown: polled.markdown,
    pageCount: polled.pageCount,
    mode: "flash",
    remoteJobId: createBody.data.task_id,
  };
}

export async function extractWithMineru(
  pdfAbsPath: string,
  token: string | undefined,
  onProgress?: MineruProgressCallback,
  signal?: AbortSignal,
): Promise<MineruExtractResult> {
  if (token?.trim()) {
    return extractWithMineruPrecisionUpload(token.trim(), pdfAbsPath, onProgress, signal);
  }
  return extractWithMineruFlashUpload(pdfAbsPath, onProgress, signal);
}

export async function testMineruConnection(token: string): Promise<{ ok: true; message: string }> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: true, message: "No token — flash (free) mode available (10MB / 20 pages)." };
  }
  const res = await fetch(`${MINERU_BASE}/api/v4/extract/task/not-a-real-task`, {
    headers: { Authorization: `Bearer ${trimmed}` },
  });
  const body = (await res.json()) as MineruApiResponse<unknown>;
  if (body.code === 0) {
    return { ok: true, message: "Token accepted." };
  }
  if (body.msg?.toLowerCase().includes("token")) {
    throw new Error(body.msg);
  }
  return { ok: true, message: "Token accepted (precision API reachable)." };
}
