/**
 * Shared permission / confirm timeout constants.
 *
 * Main ACP (`acp/service.ts`), gated tools (`move` / `delete`), and the chat
 * permission UI (`permission-actions.ts`) must share one wall clock so auto-deny
 * does not drift. The Experiments run-confirm modal is intentionally shorter —
 * the user just typed the command (quick re-read, not a fresh agent tool call).
 */

/** ACP / OpenCode tool-permission prompt auto-deny (main process). */
export const PERMISSION_TIMEOUT_MS = 120_000;

/** Chat permission UI auto-deny — same value as main. */
export const PERMISSION_UI_TIMEOUT_MS = PERMISSION_TIMEOUT_MS;

/**
 * Experiments mode "Run" confirm modal auto-deny.
 * Shorter than {@link PERMISSION_TIMEOUT_MS} by design, but long enough to
 * re-read a multi-line command (Bug #16 — 15s was too aggressive).
 */
export const EXPERIMENT_RUN_CONFIRM_TIMEOUT_MS = 60_000;
