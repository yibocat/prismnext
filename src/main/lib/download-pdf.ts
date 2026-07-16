const CATALOG_USER_AGENT = "PrismNext/1.0 (mailto:support@researchprism.app)";
const MAX_PDF_BYTES = 80 * 1024 * 1024;

export interface PdfDownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
}

function parseContentLength(header: string | null): number | null {
  if (!header?.trim()) return null;
  const n = Number.parseInt(header, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function assertValidPdf(buf: Buffer): void {
  if (buf.length < 5 || buf.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw new Error("Downloaded file is not a PDF");
  }
  if (buf.length > MAX_PDF_BYTES) {
    throw new Error("PDF exceeds size limit");
  }
}

/** Download PDF bytes from a public URL (arXiv, open access links). */
export async function downloadPdfBytes(
  url: string,
  onProgress?: (info: PdfDownloadProgress) => void,
): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": CATALOG_USER_AGENT,
      Accept: "application/pdf,*/*",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`PDF download failed: HTTP ${res.status}`);
  }

  const totalBytes = parseContentLength(res.headers.get("content-length"));

  if (!onProgress || !res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    assertValidPdf(buf);
    onProgress?.({ receivedBytes: buf.length, totalBytes: totalBytes ?? buf.length });
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    receivedBytes += chunk.length;
    onProgress({ receivedBytes, totalBytes });
  }
  const buf = Buffer.concat(chunks);
  assertValidPdf(buf);
  return buf;
}

export function arxivPdfUrl(arxivId: string | null | undefined): string | null {
  if (!arxivId?.trim()) return null;
  const id = arxivId.replace(/^arxiv:/i, "").trim();
  if (!/^\d{4}\.\d{4,5}(?:v\d+)?$/i.test(id)) return null;
  return `https://arxiv.org/pdf/${id}.pdf`;
}
