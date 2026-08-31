/**
 * Pure helpers for P7: map Host Tinymist loopback ports onto the laptop
 * and rewrite the iframe URL. Never put a Host public IP in the URL.
 */

export type TypstPreviewForwardPlan = {
  /** Static HTTP port on the Host. Laptop may bind any local port and rewrite the URL. */
  staticRemotePort: number;
  /**
   * Extra Host ports the iframe JS still dials as `127.0.0.1:<this>`.
   * Laptop must bind the **same number** locally (SSH `-L 127.0.0.1:N:127.0.0.1:N`).
   */
  sameNumberRemotePorts: number[];
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function parseTypstPreviewLoopbackPort(previewUrl: string): number | null {
  try {
    const url = new URL(previewUrl);
    if (!LOOPBACK_HOSTS.has(url.hostname)) return null;
    if (url.port) {
      const port = Number(url.port);
      return Number.isInteger(port) && port > 0 ? port : null;
    }
    if (url.protocol === "https:") return 443;
    if (url.protocol === "http:") return 80;
    return null;
  } catch {
    return null;
  }
}

export function planTypstPreviewForwards(input: {
  previewUrl: string;
  staticServerPort?: number;
  dataPlanePort?: number;
}): TypstPreviewForwardPlan {
  const fromUrl = parseTypstPreviewLoopbackPort(input.previewUrl);
  const staticRemotePort =
    typeof input.staticServerPort === "number" && input.staticServerPort > 0
      ? input.staticServerPort
      : fromUrl;
  if (!staticRemotePort) {
    throw new Error("Typst preview URL is missing a loopback port to forward");
  }
  if (fromUrl && fromUrl !== staticRemotePort) {
    throw new Error(
      `Typst preview URL port ${fromUrl} does not match staticServerPort ${staticRemotePort}`,
    );
  }
  const sameNumberRemotePorts: number[] = [];
  const data = input.dataPlanePort;
  if (typeof data === "number" && data > 0 && data !== staticRemotePort) {
    sameNumberRemotePorts.push(data);
  }
  return { staticRemotePort, sameNumberRemotePorts };
}

export function rewriteTypstPreviewUrl(
  previewUrl: string,
  remotePort: number,
  localPort: number,
): string {
  if (remotePort === localPort) {
    return ensureTrailingSlash(previewUrl);
  }
  try {
    const url = new URL(previewUrl);
    if (!LOOPBACK_HOSTS.has(url.hostname)) {
      throw new Error("Typst preview URL must stay on loopback (127.0.0.1)");
    }
    const current = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    if (current !== remotePort) {
      throw new Error(`Typst preview URL port ${current} is not the forwarded remote port ${remotePort}`);
    }
    url.hostname = "127.0.0.1";
    url.port = String(localPort);
    return ensureTrailingSlash(url.toString());
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error("Typst preview URL is not a valid URL");
    }
    throw err;
  }
}

function ensureTrailingSlash(href: string): string {
  if (href.endsWith("/")) return href;
  try {
    const url = new URL(href);
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/";
      return url.toString();
    }
  } catch {
    // keep original
  }
  return href;
}
