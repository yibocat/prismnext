import { net, protocol } from "electron";
import { pathToFileURL } from "node:url";
import { literaturePdfAbsPathFromUrl } from "../literature/pdf/url";

export { toLiteraturePdfUrl } from "../literature/pdf/url";

export function registerLiteraturePdfProtocol(): void {
  protocol.handle("literature-pdf", (request) => {
    const absPath = literaturePdfAbsPathFromUrl(request.url);
    if (!absPath) {
      return new Response("Invalid literature-pdf URL", { status: 400 });
    }
    return net.fetch(pathToFileURL(absPath).toString());
  });
}
