/** Shown when catalogs return metadata but no downloadable PDF URL. */
export const PDF_ATTACH_NO_OA_URL =
  "No open-access PDF URL found — bibliographic catalogs did not return a downloadable link.";

export const PDF_ATTACH_PAYWALL_FALLBACK =
  "No open-access PDF found for this entry. Publisher paywalled PDFs cannot be auto-downloaded — import a PDF file manually.";

const MANUAL_IMPORT_HINT = "Use Add → Import PDF, or drag a PDF into the library.";

function appendGuidance(detail: string, guidance: string): string {
  const d = detail.trim();
  const g = guidance.trim();
  if (!g) return d;
  if (!d) return g;
  if (d.includes(g)) return d;
  return `${d}\n\n${g}`;
}

/** Combine step-level errors (arXiv, catalog lookup, open-access link). */
export function joinPdfAttachAttempts(parts: (string | undefined | null)[]): string | undefined {
  const filtered = parts
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));
  if (filtered.length === 0) return undefined;
  return filtered.join(" · ");
}

function httpStatusHint(code: string): string | undefined {
  switch (code) {
    case "401":
    case "403":
      return "Access may require a subscription or login.";
    case "404":
      return "The PDF link may be outdated or removed.";
    case "429":
      return "The server is rate-limiting requests — retry in a minute.";
    case "500":
    case "502":
    case "503":
      return "The host server returned an error — retry later.";
    default:
      return undefined;
  }
}

/** User-facing copy for PDF attach / download failures (renderer toasts). */
export function formatPdfDownloadFailure(raw?: string | null): {
  title: string;
  description?: string;
} {
  const msg = raw?.trim() ?? "";
  if (!msg) {
    return {
      title: "Could not download PDF",
      description: appendGuidance(
        "No error details were returned.",
        MANUAL_IMPORT_HINT,
      ),
    };
  }

  if (msg.includes("PDF already attached")) {
    return { title: "PDF already attached" };
  }

  if (msg.includes("Add a DOI or arXiv")) {
    return {
      title: "Missing identifier",
      description: "Add a DOI or arXiv ID, then try Download PDF again.",
    };
  }

  if (/ · |^arXiv:|^Catalog lookup:|^Open-access link:|^Metadata:/i.test(msg)) {
    return {
      title: "Could not download PDF",
      description: appendGuidance(msg, MANUAL_IMPORT_HINT),
    };
  }

  const httpMatch = msg.match(/HTTP (\d{3})/i);
  if (httpMatch) {
    const hint = httpStatusHint(httpMatch[1]!);
    return {
      title: "PDF download failed",
      description: appendGuidance(msg, hint ?? MANUAL_IMPORT_HINT),
    };
  }

  if (/not a PDF/i.test(msg)) {
    return {
      title: "Downloaded file is not a PDF",
      description: appendGuidance(
        msg,
        "The URL may point to an HTML landing page instead of a PDF file.",
      ),
    };
  }

  if (/size limit/i.test(msg)) {
    return {
      title: "PDF too large",
      description: appendGuidance(msg, MANUAL_IMPORT_HINT),
    };
  }

  if (/429|rate limit/i.test(msg)) {
    const service =
      msg.match(/Semantic Scholar|OpenAlex|Crossref|arXiv|bibliographic-metadata/i)?.[0] ??
      "Bibliographic service";
    const detail = msg.includes(service) ? msg : `${service}: ${msg}`;
    return {
      title: "PDF lookup temporarily limited",
      description: appendGuidance(
        detail,
        "Wait a minute and retry, or import a PDF manually.",
      ),
    };
  }

  if (
    msg === PDF_ATTACH_NO_OA_URL ||
    msg === PDF_ATTACH_PAYWALL_FALLBACK ||
    msg.includes("No open-access PDF") ||
    msg.toLowerCase().includes("paywall")
  ) {
    if (msg === PDF_ATTACH_NO_OA_URL) {
      return {
        title: "No open-access PDF found",
        description: appendGuidance(
          "Catalog metadata was found, but no public PDF download link is available for this entry.",
          MANUAL_IMPORT_HINT,
        ),
      };
    }
    if (msg === PDF_ATTACH_PAYWALL_FALLBACK) {
      return {
        title: "No open-access PDF found",
        description: appendGuidance(
          "Publisher PDFs are often subscription-only.",
          MANUAL_IMPORT_HINT,
        ),
      };
    }
    return {
      title: "No open-access PDF found",
      description: appendGuidance(msg, MANUAL_IMPORT_HINT),
    };
  }

  if (/network|fetch failed|ECONNREFUSED|ENOTFOUND|timeout/i.test(msg)) {
    return {
      title: "PDF download failed",
      description: appendGuidance(msg, "Check your network connection and retry."),
    };
  }

  return {
    title: "Could not download PDF",
    description: appendGuidance(msg, MANUAL_IMPORT_HINT),
  };
}
