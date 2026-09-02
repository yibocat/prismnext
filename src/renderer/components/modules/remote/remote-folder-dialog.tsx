import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderIcon, FolderUpIcon, Loader2Icon } from "lucide-react";
import {
  isRemoteDirectoryExists,
  isRemoteDirectoryMissing,
  joinPosixSegment,
  normalizePosixAbs,
  remoteBrowseCreatePath,
  remoteHomeFromAppHome,
  unwrapRemoteErrorMessage,
} from "@shared/remote";
import type { RemoteDirListing } from "@shared/remote";
import { useRemoteStore } from "@/stores/remote-store";
import { listRemoteHostDir, mkdirRemoteHostDir } from "@/lib/remote/host-projects";
import {
  connectProgress,
  logsForProfile,
} from "@/lib/remote/display";
import { remotePhaseIsReady } from "@/lib/remote/ensure-connected";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { appMenuFontClass } from "@/components/ui/app-menu";
import { cn } from "@/lib/utils";

const folderRowClass = cn(
  "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left",
  appMenuFontClass,
  "hover:bg-accent hover:text-accent-foreground",
);

function RemoteConnectInlineStatus({ alias }: { alias: string }) {
  const { t } = useTranslation();
  const state = useRemoteStore((s) => s.byProfileId[alias]);
  const logs = useRemoteStore((s) => s.logs);
  const connect = useRemoteStore((s) => s.connect);
  const trustHostAndConnect = useRemoteStore((s) => s.trustHostAndConnect);
  const phase = state?.phase ?? "connecting";
  const profileLogs = useMemo(() => logsForProfile(logs, alias, 80), [alias, logs]);
  const constitution = state && (
    state.phase === "ready"
    || state.phase === "error"
    || state.phase === "reconnecting"
  )
    ? state.constitution
    : undefined;
  const progress = useMemo(
    () => connectProgress({
      constitution,
      phase,
      logs: profileLogs,
    }),
    [constitution, phase, profileLogs],
  );
  const awaiting = state?.phase === "awaiting_host_key" ? state : null;
  const errorMessage = state?.phase === "error"
    ? (state.code && t(`remote.error.${state.code}`, { defaultValue: state.message }))
      || state.message
    : null;

  return (
    <div className="space-y-2 px-1 py-2">
      <p className="text-[length:var(--font-size-12)] text-muted-foreground">
        {t(`remote.phase.${phase}`)}
        {progress.currentGate ? ` · ${t(`remote.gate.${progress.currentGate}`)}` : null}
      </p>
      {phase !== "error" && phase !== "awaiting_host_key" ? (
        <div className="space-y-1">
          <Progress value={progress.percent} className="h-1.5 bg-muted" />
          <p className="text-[length:var(--font-size-12)] text-muted-foreground tabular-nums">
            {t("remote.connectProgress", { percent: progress.percent })}
          </p>
        </div>
      ) : null}
      {awaiting ? (
        <div className="space-y-2">
          <p className="text-[length:var(--font-size-12)] text-foreground">
            {t("remote.hostKeyPrompt", { fingerprint: awaiting.hostKey.fingerprint })}
          </p>
          <Button
            type="button"
            size="xs"
            onClick={() => void trustHostAndConnect(alias, awaiting.hostKey)}
          >
            {t("remote.trustHost")}
          </Button>
        </div>
      ) : null}
      {errorMessage ? (
        <div className="space-y-2">
          <p className="text-[length:var(--font-size-12)] text-destructive">{errorMessage}</p>
          <Button type="button" size="xs" variant="outline" onClick={() => void connect(alias)}>
            {t("remote.retry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function RemoteFolderBrowser({
  alias,
  confirmLabel,
  onConfirm,
  embedded = false,
}: {
  alias: string;
  confirmLabel: string;
  onConfirm: (remoteRoot: string) => Promise<void>;
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const handshake = useRemoteStore((s) => {
    const state = s.byProfileId[alias];
    return state?.phase === "ready" ? state.handshake : null;
  });
  const ready = useRemoteStore((s) => remotePhaseIsReady(s.byProfileId[alias]?.phase));
  const [path, setPath] = useState("");
  const [draft, setDraft] = useState("");
  const [listing, setListing] = useState<RemoteDirListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const home = handshake ? remoteHomeFromAppHome(handshake.appHome) : null;
    const start = home ?? "/";
    setPath(start);
    setDraft(start);
    setError(null);
  }, [handshake, ready]);

  useEffect(() => {
    if (!ready || !path) return;
    let cancelled = false;
    setError(null);
    void listRemoteHostDir(alias, path)
      .then((next) => {
        if (cancelled) return;
        setListing(next);
        setDraft(next.path);
      })
      .catch((err) => {
        if (cancelled) return;
        setListing(null);
        setError(
          isRemoteDirectoryMissing(err)
            ? t("remote.listingError")
            : (unwrapRemoteErrorMessage(err) || t("remote.listingError")),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [alias, path, ready, t]);

  const goTo = (next: string | null) => {
    const abs = next ? normalizePosixAbs(next) : null;
    if (!abs) return;
    setPath(abs);
    setDraft(abs);
  };

  const applyListing = (next: RemoteDirListing) => {
    setListing(next);
    setPath(next.path);
    setDraft(next.path);
    setError(null);
  };

  const commitDraft = async () => {
    const abs = normalizePosixAbs(draft);
    if (!abs) {
      setError(t("remote.folderRequired"));
      return;
    }
    if (abs === path && listing) return;
    setBusy(true);
    setError(null);
    try {
      try {
        applyListing(await listRemoteHostDir(alias, abs));
        return;
      } catch (err) {
        if (!isRemoteDirectoryMissing(err)) {
          setError(unwrapRemoteErrorMessage(err) || t("remote.listingError"));
          return;
        }
      }
      const createPath = remoteBrowseCreatePath(draft);
      if (!createPath) {
        setError(t("remote.listingError"));
        return;
      }
      try {
        await mkdirRemoteHostDir(alias, createPath);
      } catch (err) {
        if (!isRemoteDirectoryExists(err)) {
          setError(unwrapRemoteErrorMessage(err) || t("remote.createFolderFailed"));
          return;
        }
      }
      applyListing(await listRemoteHostDir(alias, createPath));
    } catch (err) {
      setError(unwrapRemoteErrorMessage(err) || t("remote.createFolderFailed"));
    } finally {
      setBusy(false);
    }
  };

  const confirmPath = normalizePosixAbs(path);
  const canConfirm = Boolean(confirmPath) && ready && !busy;

  const submit = async () => {
    if (!confirmPath) {
      setError(t("remote.folderRequired"));
      return;
    }
    setBusy(true);
    try {
      await onConfirm(confirmPath);
    } catch (err) {
      setError(unwrapRemoteErrorMessage(err) || t("remote.phase.error"));
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return <RemoteConnectInlineStatus alias={alias} />;
  }

  return (
    <div className={cn(embedded ? "px-2 pb-2" : "space-y-1.5")}>
      {embedded ? null : (
        <>
          <p className={cn("truncate px-1 text-muted-foreground", appMenuFontClass)}>
            {path}
          </p>
          <div className="border-t border-border" />
        </>
      )}
      <Input
        value={draft}
        disabled={busy}
        placeholder={t("remote.folderPlaceholder")}
        className={cn(
          "h-7 min-w-0 border-0 bg-transparent px-1 shadow-none dark:bg-transparent",
          appMenuFontClass,
          "!text-[length:var(--font-menu-item)]",
        )}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commitDraft();
          }
        }}
      />
      <div className="max-h-56 overflow-y-auto">
        {listing?.parent ? (
          <button
            type="button"
            className={cn(folderRowClass, "text-muted-foreground")}
            onClick={() => goTo(listing.parent)}
          >
            <FolderUpIcon className="size-3.5 shrink-0 opacity-70" />
            <span>{t("remote.up")}</span>
          </button>
        ) : null}
        {listing?.entries.map((entry) => (
          <button
            key={entry.name}
            type="button"
            className={folderRowClass}
            onClick={() => goTo(joinPosixSegment(listing.path, entry.name))}
          >
            <FolderIcon className="size-3.5 shrink-0 opacity-70" />
            <span className="min-w-0 truncate">{entry.name}</span>
          </button>
        ))}
        {listing && listing.entries.length === 0 && !listing.parent ? (
          <p className={cn("px-2 py-2 text-muted-foreground", appMenuFontClass)}>
            {t("remote.noRemoteProjects")}
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="px-1 text-[length:var(--font-size-12)] text-destructive">{error}</p>
      ) : null}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={!canConfirm}
          onClick={() => void submit()}
        >
          {busy ? <Loader2Icon className="size-3 animate-spin" /> : null}
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

export function RemoteFolderDialog({
  alias,
  mode,
  open,
  onOpenChange,
  onConfirm,
}: {
  alias: string | null;
  mode: "open" | "browse";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (remoteRoot: string) => Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>
            {t(mode === "browse" ? "remote.browseParentTitle" : "remote.folderDialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {alias}
          </DialogDescription>
        </DialogHeader>
        {alias ? (
          <RemoteFolderBrowser
            alias={alias}
            confirmLabel={t(mode === "browse" ? "remote.useFolder" : "remote.open")}
            onConfirm={async (remoteRoot) => {
              await onConfirm(remoteRoot);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
