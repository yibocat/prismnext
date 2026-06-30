import { net, protocol } from "electron";
import { pathToFileURL } from "node:url";

const URL_PREFIX = "literature-pdf://file/";

/** Renderer-safe URL — pdf.js fetches via registered protocol (no giant IPC copy). */
export function toLiteraturePdfUrl(absPath: string): string {
  return `${URL_PREFIX}${encodeURIComponent(absPath)}`;
}

export function registerLiteraturePdfProtocol(): void {
  protocol.handle("literature-pdf", (request) => {
    if (!request.url.startsWith(URL_PREFIX)) {
      return new Response("Invalid literature-pdf URL", { status: 400 });
    }
    const absPath = decodeURIComponent(request.url.slice(URL_PREFIX.length));
    return net.fetch(pathToFileURL(absPath).toString());
  });
}
