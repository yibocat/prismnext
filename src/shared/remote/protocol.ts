/**
 * SSH-tunnel frames. Method names align with existing IPC (`agent:send`, `fs:readFile`, …).
 */

export const REMOTE_PROTOCOL_REV = 1 as const;

/** Soft cap for one NDJSON line. Oversized blobs use a later dedicated channel. */
export const MAX_REMOTE_FRAME_BYTES = 8 * 1024 * 1024;

export type HostHandshakeFeature =
  | "control"
  | "agent"
  | "fs"
  | "git"
  | "literature"
  | "compile"
  | "experiment"
  | "terminal";

export interface HostStamp {
  /** Desktop app version that pushed this payload — not a Host product number. */
  desktopVersion: string;
  payloadSha256: string;
}

export interface HostHandshake extends HostStamp {
  protocolRev: typeof REMOTE_PROTOCOL_REV;
  /** Remote `~/.prismnext`. */
  appHome: string;
  /** Remote `~/.prismnext-host`. */
  hostRoot: string;
  features: HostHandshakeFeature[];
}

export interface RemoteFrameError {
  code: string;
  message: string;
}

export type RemoteFrame =
  | { kind: "req"; id: string; method: string; params: unknown }
  | { kind: "res"; id: string; ok: true; result: unknown }
  | { kind: "res"; id: string; ok: false; error: RemoteFrameError }
  | { kind: "event"; channel: string; payload: unknown };

/** Desktop or test event outlet — replaces emitToOwner(webContents) later. */
export interface AgentEventSink {
  emit(channel: "agent:event" | "agent:permission", payload: unknown): void;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function stringifyRemoteFrame(frame: RemoteFrame): string {
  return JSON.stringify(frame);
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function parseRemoteFrame(line: string): RemoteFrame {
  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error("empty remote frame");
  }
  if (utf8ByteLength(trimmed) > MAX_REMOTE_FRAME_BYTES) {
    throw new Error("remote frame exceeds 8 MiB");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("remote frame is not JSON");
  }
  const rec = asRecord(parsed);
  if (!rec) throw new Error("remote frame is not an object");

  if (rec.kind === "req") {
    if (typeof rec.id !== "string" || rec.id.length === 0) throw new Error("req frame missing id");
    if (typeof rec.method !== "string" || rec.method.length === 0) {
      throw new Error("req frame missing method");
    }
    return { kind: "req", id: rec.id, method: rec.method, params: rec.params };
  }

  if (rec.kind === "res") {
    if (typeof rec.id !== "string" || rec.id.length === 0) throw new Error("res frame missing id");
    if (rec.ok === true) return { kind: "res", id: rec.id, ok: true, result: rec.result };
    if (rec.ok === false) {
      const error = asRecord(rec.error);
      const code = typeof error?.code === "string" ? error.code : "protocol";
      const message = typeof error?.message === "string" ? error.message : "remote request failed";
      return { kind: "res", id: rec.id, ok: false, error: { code, message } };
    }
    throw new Error("res frame missing ok");
  }

  if (rec.kind === "event") {
    if (typeof rec.channel !== "string" || rec.channel.length === 0) {
      throw new Error("event frame missing channel");
    }
    return { kind: "event", channel: rec.channel, payload: rec.payload };
  }

  throw new Error(`unknown remote frame kind: ${String(rec.kind)}`);
}

export function isHostHandshake(value: unknown): value is HostHandshake {
  const rec = asRecord(value);
  if (!rec) return false;
  if (rec.protocolRev !== REMOTE_PROTOCOL_REV) return false;
  if (typeof rec.desktopVersion !== "string" || rec.desktopVersion.length === 0) return false;
  if (typeof rec.payloadSha256 !== "string" || rec.payloadSha256.length === 0) return false;
  if (typeof rec.appHome !== "string" || rec.appHome.length === 0) return false;
  if (typeof rec.hostRoot !== "string" || rec.hostRoot.length === 0) return false;
  if (!Array.isArray(rec.features)) return false;
  return rec.features.every((item) => typeof item === "string");
}
