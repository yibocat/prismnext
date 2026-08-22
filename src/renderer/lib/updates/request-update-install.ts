/**
 * Ask main to quitAndInstall. If the process is still alive after a short wait,
 * treat install as failed (common on unsigned macOS) so the UI can recover.
 */

import { updatesDesktop } from "@/lib/desktop-api/updates";

export async function requestUpdateInstall(options?: {
  /** ms to wait for process exit after a successful quitAndInstall call. */
  settleMs?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const settleMs = options?.settleMs ?? 2800;
  const result = await updatesDesktop.updateInstall();
  if (!result.ok) return result;

  await new Promise<void>((resolve) => {
    setTimeout(resolve, settleMs);
  });

  return {
    ok: false,
    error: "install-did-not-restart",
  };
}
