/**
 * Stable remote error codes. `payload_stale` means “push this desktop’s
 * extraResources again”, not “pick a Host version”.
 */
export const REMOTE_ERROR_CODES = [
  "ssh_auth",
  "payload_stale",
  "payload_missing_local",
  "entitlement",
  "bootstrap_checksum",
  "not_connected",
  "host_key_unknown",
  "host_key_mismatch",
  "host_runtime",
  "protocol",
  "path_escaped",
  "agent_not_on_remote_yet",
] as const;

export type RemoteErrorCode = (typeof REMOTE_ERROR_CODES)[number];

export function isRemoteErrorCode(value: unknown): value is RemoteErrorCode {
  return typeof value === "string" && (REMOTE_ERROR_CODES as readonly string[]).includes(value);
}

export class RemoteOperationError extends Error {
  readonly code: RemoteErrorCode;
  readonly host?: string;
  readonly port?: number;
  readonly fingerprint?: string;

  constructor(
    code: RemoteErrorCode,
    message: string,
    extras?: { host?: string; port?: number; fingerprint?: string },
  ) {
    super(message);
    this.name = "RemoteOperationError";
    this.code = code;
    this.host = extras?.host;
    this.port = extras?.port;
    this.fingerprint = extras?.fingerprint;
  }
}

export function toRemoteErrorCode(value: unknown, fallback: RemoteErrorCode = "protocol"): RemoteErrorCode {
  return isRemoteErrorCode(value) ? value : fallback;
}
