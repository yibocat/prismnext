import { createHash } from "node:crypto";

/** Parse `sha256:<hex>` digest from Agent Skills Discovery index. */
export function parseSha256Digest(digest?: string): string | null {
  if (!digest?.trim()) return null;
  const match = digest.trim().match(/^sha256:([a-f0-9]{64})$/i);
  return match ? match[1].toLowerCase() : null;
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function verifySha256Digest(data: string | Buffer, digest?: string): void {
  const expected = parseSha256Digest(digest);
  if (!expected) return;
  const actual = sha256Hex(data);
  if (actual !== expected) {
    throw new Error(
      "Skill package digest mismatch — the download may be corrupted or modified since the index was published.",
    );
  }
}

export async function readResponseBytes(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer());
}

/** Map HTTP status codes to user-facing install/update errors. */
export function httpFetchError(url: string, status: number, context: string): Error {
  if (status === 404) {
    return new Error(`${context}: not found (404). Check the URL or repository visibility.`);
  }
  if (status === 403) {
    return new Error(
      `${context}: access denied (403). The resource may be private or GitHub rate limits may apply — try again later.`,
    );
  }
  if (status === 429) {
    return new Error(`${context}: rate limited (429). Wait a few minutes and try again.`);
  }
  return new Error(`${context} failed (${status}): ${url}`);
}

export async function fetchOk(url: string, init?: RequestInit, context = "Request"): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw httpFetchError(url, response.status, context);
  }
  return response;
}
