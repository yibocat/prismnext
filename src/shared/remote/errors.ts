/**
 * Stable remote error codes. `payload_stale` means “push this desktop’s
 * extraResources again”, not “pick a Host version”.
 */
export const REMOTE_ERROR_CODES = [
  "ssh_auth",
  "ssh_missing",
  "ssh_jump",
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
  "extract_parser_unavailable",
  "sync_too_large",
  "sync_cancelled",
  "compile_engine_unavailable",
  "displaced",
] as const;

/** Packaged app, not “run pnpm host:pack”. The server downloads Node/Git/Tectonic, not the Host program. */
export const PAYLOAD_MISSING_LOCAL_MESSAGE =
  "This copy of PrismNext is missing the remote Host program. Reinstall PrismNext. The server downloads Node, Git, and Tectonic itself; it does not download the Host program.";

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

const INVOKE_PREFIX = /^Error invoking remote method '[^']+':\s*/i;
const ERROR_NAME_PREFIX = /^RemoteOperationError:\s*/i;

/** Strip Electron IPC / class-name wrappers so the UI can show the Host line. */
export function unwrapRemoteErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  return raw.replace(INVOKE_PREFIX, "").replace(ERROR_NAME_PREFIX, "").trim();
}

export function isRemoteDirectoryMissing(err: unknown): boolean {
  return /^Directory not found:/i.test(unwrapRemoteErrorMessage(err));
}

export function isRemoteDirectoryExists(err: unknown): boolean {
  return /already exists/i.test(unwrapRemoteErrorMessage(err));
}
