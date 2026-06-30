const CATALOG_USER_AGENT = "Prism/1.0 (mailto:support@researchprism.app)";
const MAX_PDF_BYTES = 80 * 1024 * 1024;

/** Download PDF bytes from a public URL (arXiv, open access links). */
export async function downloadPdfBytes(url: string): Promise<Buffer> {
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
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5 || buf.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw new Error("Downloaded file is not a PDF");
  }
  if (buf.length > MAX_PDF_BYTES) {
    throw new Error("PDF exceeds size limit");
  }
  return buf;
}

export function arxivPdfUrl(arxivId: string | null | undefined): string | null {
  if (!arxivId?.trim()) return null;
  const id = arxivId.replace(/^arxiv:/i, "").trim();
  if (!/^\d{4}\.\d{4,5}(?:v\d+)?$/i.test(id)) return null;
  return `https://arxiv.org/pdf/${id}.pdf`;
}
