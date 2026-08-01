/**
 * Parse OpenCode's on-disk log for provider stream failures.
 *
 * OpenCode often keeps quota / rate-limit / API errors internal (retries in
 * silence) and never forwards them over ACP — the chat UI would otherwise sit
 * on "Planning next step…" forever. The log line is the reliable signal.
 */
import { openSync, readSync, closeSync, fstatSync, existsSync } from "node:fs";

export type OpenCodeStreamError = {
  sessionId: string;
  message: string;
  /** Title / small helper streams — ignore for primary-turn UX. */
  small: boolean;
  mode: string;
};

/** Extract a primary-capable stream error from one opencode.log line. */
export function parseOpenCodeStreamErrorLine(line: string): OpenCodeStreamError | null {
  if (!line.includes("stream error")) return null;
  if (!line.includes("session.id=") && !line.includes("session.id =")) return null;

  const sessionId = /session\.id=([^\s"]+)/.exec(line)?.[1]?.trim();
  if (!sessionId) return null;

  const small = /\bsmall=true\b/.test(line);
  const mode = /\bmode=([^\s"]+)/.exec(line)?.[1]?.trim() ?? "";

  let raw =
    /error\.error="((?:\\.|[^"\\])*)"/.exec(line)?.[1]
    ?? /error\.error='((?:\\.|[^'\\])*)'/.exec(line)?.[1]
    ?? "";
  if (!raw) {
    // Some builds omit quotes: error.error=AI_APICallError: ...
    const loose = /error\.error=(.+)$/.exec(line)?.[1]?.trim();
    if (loose) raw = loose.replace(/^"|"$/g, "");
  }
  if (!raw) return null;

  raw = raw.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  const message = cleanProviderErrorMessage(raw);
  if (!message) return null;

  return { sessionId, message, small, mode };
}

export function isPrimaryOpenCodeStreamError(err: OpenCodeStreamError): boolean {
  if (err.small) return false;
  // Prefer primary agent turns; still accept unknown mode if not a title helper.
  if (err.mode && err.mode !== "primary") return false;
  return true;
}

export function cleanProviderErrorMessage(raw: string): string {
  let message = raw.trim();
  message = message.replace(/^AI_APICallError:\s*/i, "");
  message = message.replace(
    /^AI_RetryError:\s*Failed after \d+ attempts\.\s*Last error:\s*/i,
    "",
  );
  message = message.replace(/^AI_RetryError:\s*/i, "");
  return message.trim();
}

/**
 * Read new bytes from `path` starting at `offset`, return updated offset + lines.
 * Best-effort — never throws into the turn loop.
 */
export function readOpenCodeLogDelta(
  path: string,
  offset: number,
): { offset: number; lines: string[] } {
  if (!existsSync(path)) return { offset, lines: [] };
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size;
    if (size < offset) {
      // Log rotated / truncated — resync to end (skip backlog).
      return { offset: size, lines: [] };
    }
    if (size === offset) return { offset, lines: [] };
    const len = size - offset;
    // Cap one read so a huge log dump cannot stall the main process.
    const readLen = Math.min(len, 256 * 1024);
    const buf = Buffer.alloc(readLen);
    const n = readSync(fd, buf, 0, readLen, offset);
    const text = buf.toString("utf8", 0, n);
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    return { offset: offset + n, lines };
  } catch {
    return { offset, lines: [] };
  } finally {
    if (fd != null) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

export function openCodeLogEndOffset(path: string): number {
  if (!existsSync(path)) return 0;
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    return fstatSync(fd).size;
  } catch {
    return 0;
  } finally {
    if (fd != null) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}
