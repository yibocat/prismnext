/**
 * Laptop-side SSH `-L` for Host Tinymist preview HTTP/WS.
 * Does not occupy the forwarded TCP stream — Chromium connects itself.
 */

import type { TypstPreviewForwardPlan } from "../../shared/typst/preview-tunnel";
import { rewriteTypstPreviewUrl } from "../../shared/typst/preview-tunnel";
import type { TypstPreviewReadyEvent } from "../../shared/typst/session";

export type TypstPreviewPortForward = {
  localPort: number;
  close(): Promise<void>;
};

type TrackedForward = TypstPreviewPortForward & { refs: number };

const byProfile = new Map<string, Map<number, TrackedForward>>();

export async function ensureTypstPreviewForwards(
  profileId: string,
  plan: TypstPreviewForwardPlan,
  open: (remotePort: number, localPort?: number) => Promise<TypstPreviewPortForward>,
): Promise<Map<number, number>> {
  const table = byProfile.get(profileId) ?? new Map<number, TrackedForward>();
  byProfile.set(profileId, table);
  const remoteToLocal = new Map<number, number>();

  async function acquire(remotePort: number, preferredLocal?: number): Promise<number> {
    const existing = table.get(remotePort);
    if (existing) {
      existing.refs += 1;
      remoteToLocal.set(remotePort, existing.localPort);
      return existing.localPort;
    }
    const handle = await open(remotePort, preferredLocal);
    if (preferredLocal != null && handle.localPort !== preferredLocal) {
      await handle.close().catch(() => undefined);
      throw new Error(
        `Typst preview data-plane needs local port ${preferredLocal}, got ${handle.localPort}. ` +
          "The iframe would still dial the Host loopback number.",
      );
    }
    table.set(remotePort, { localPort: handle.localPort, close: handle.close, refs: 1 });
    remoteToLocal.set(remotePort, handle.localPort);
    return handle.localPort;
  }

  await acquire(plan.staticRemotePort);
  for (const extra of plan.sameNumberRemotePorts) {
    await acquire(extra, extra);
  }
  return remoteToLocal;
}

export async function releaseTypstPreviewForwards(profileId: string): Promise<void> {
  const table = byProfile.get(profileId);
  if (!table) return;
  byProfile.delete(profileId);
  await Promise.all([...table.values()].map((item) => item.close().catch(() => undefined)));
}

export function rewriteReadyEventForLaptop(
  event: TypstPreviewReadyEvent,
  plan: TypstPreviewForwardPlan,
  remoteToLocal: Map<number, number>,
): TypstPreviewReadyEvent {
  const localStatic = remoteToLocal.get(plan.staticRemotePort);
  if (!localStatic) {
    throw new Error("Typst preview tunnel did not bind the static port");
  }
  return {
    ...event,
    previewUrl: rewriteTypstPreviewUrl(event.previewUrl, plan.staticRemotePort, localStatic),
  };
}
