import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderIcon, Loader2Icon } from "lucide-react";
import { joinPosixSegment, normalizePosixAbs, remoteHomeFromAppHome } from "@shared/remote";
import type { RemoteDirListing } from "@shared/remote";
import { useRemoteStore } from "@/stores/remote-store";
import { listRemoteHostDir } from "@/lib/remote/host-projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function RemoteFolderDialog({
  alias,
  mode,
  open,
  onOpenChange,
  onConfirm,
}: {
  alias: string | null;
  mode: "open" | "create";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (remoteRoot: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const handshake = useRemoteStore((s) => {
    if (!alias) return null;
    const state = s.byProfileId[alias];
    return state?.phase === "ready" ? state.handshake : null;
  });
  const [path, setPath] = useState("");
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [listing, setListing] = useState<RemoteDirListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const home = handshake ? remoteHomeFromAppHome(handshake.appHome) : null;
    const start = home ?? "/";
    setPath(start);
    setDraft(start);
    setName("");
    setError(null);
  }, [handshake, open]);

  useEffect(() => {
    if (!open || !alias || !path) return;
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
        setError(err instanceof Error ? err.message : t("remote.listingError"));
      });
    return () => {
      cancelled = true;
    };
  }, [alias, open, path, t]);

  const goTo = (next: string | null) => {
    const abs = next ? normalizePosixAbs(next) : null;
    if (!abs) return;
    setPath(abs);
    setDraft(abs);
  };

  const confirmPath = mode === "create" ? joinPosixSegment(path, name) : normalizePosixAbs(path);
  const canConfirm = Boolean(confirmPath) && !busy;

  const submit = async () => {
    if (!confirmPath) {
      setError(t(mode === "create" ? "remote.nameInvalid" : "remote.folderRequired"));
      return;
    }
    setBusy(true);
    try {
      await onConfirm(confirmPath);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("remote.phase.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>
            {t(mode === "create" ? "remote.createDialogTitle" : "remote.folderDialogTitle")}
          </DialogTitle>
          <DialogDescription>{alias}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={draft}
            placeholder={t("remote.folderPlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                goTo(draft);
              }
            }}
          />
          {mode === "create" ? (
            <Input
              value={name}
              placeholder={t("remote.folderName")}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
          ) : null}
          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
            {listing?.parent ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => goTo(listing.parent)}
              >
                <FolderIcon className="size-3.5 shrink-0 opacity-70" />
                <span>{t("remote.up")}</span>
              </button>
            ) : null}
            {listing?.entries.map((entry) => (
              <button
                key={entry.name}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left",
                  "hover:bg-accent hover:text-accent-foreground",
                )}
                onClick={() => goTo(joinPosixSegment(listing.path, entry.name))}
              >
                <FolderIcon className="size-3.5 shrink-0 opacity-70" />
                <span className="min-w-0 truncate">{entry.name}</span>
              </button>
            ))}
            {listing && listing.entries.length === 0 && !listing.parent ? (
              <p className="px-2 py-3 text-muted-foreground">{t("remote.noRemoteProjects")}</p>
            ) : null}
          </div>
          {error ? <p className="text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("remote.close")}
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={() => void submit()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {t(mode === "create" ? "remote.create" : "remote.open")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
