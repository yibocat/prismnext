import { useTranslation } from "react-i18next";
import { RefreshCwIcon } from "lucide-react";
import { useRemoteStore } from "@/stores/remote-store";
import { useDocumentStore } from "@/stores/document-store";
import { isRemoteProjectReconnecting } from "@/lib/remote/ensure-connected";

/**
 * Degraded-mode banner shown while the Host auto-reconnects. Rendered OVER
 * the existing panel content (which stays visible but is potentially stale) —
 * reconnecting is "the app is healing itself", never an error state and never
 * a Connect prompt.
 */
export function RemoteReconnectBanner() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const byProfileId = useRemoteStore((s) => s.byProfileId);
  if (!isRemoteProjectReconnecting(projectRoot, byProfileId)) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 border-b px-3 py-1"
      // Opaque warning tokens only (theme rule: no translucent fills).
      style={{ background: "var(--warning)", borderColor: "var(--warning)" }}
    >
      <RefreshCwIcon className="size-3 shrink-0 animate-spin" />
      <span
        className="truncate text-[length:var(--font-size-11)] font-medium"
        style={{ color: "var(--warning-foreground)" }}
      >
        {t("remote.reconnectBanner")}
      </span>
      <span
        className="hidden truncate text-[length:var(--font-size-11)] opacity-80 sm:inline"
        style={{ color: "var(--warning-foreground)" }}
      >
        {t("remote.reconnectHint")}
      </span>
    </div>
  );
}
