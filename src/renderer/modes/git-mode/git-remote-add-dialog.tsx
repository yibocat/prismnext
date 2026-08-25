import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { suggestRemoteName } from "@shared/git";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGitStore } from "@/stores/git-store";

export function GitRemoteAddDialog({ projectRoot }: { projectRoot: string }) {
  const { t } = useTranslation();
  const open = useGitStore((s) => s.pendingAddRemote);
  const adding = useGitStore((s) => s.addingRemote);
  const remotes = useGitStore((s) => s.remotes);
  const [name, setName] = useState("origin");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(suggestRemoteName(remotes.map((remote) => remote.name)));
    setUrl("");
  }, [open, remotes]);

  const canSubmit = Boolean(name.trim() && url.trim()) && !adding;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) useGitStore.getState().cancelAddRemote();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("git.remoteAdd.title")}</DialogTitle>
          <DialogDescription>{t("git.remoteAdd.body")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            void useGitStore.getState().addRemote(projectRoot, { name, url });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="git-remote-url">{t("git.remoteAdd.url")}</Label>
            <Input
              id="git-remote-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("git.remoteAdd.urlPlaceholder")}
              autoFocus
              disabled={adding}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="git-remote-name">{t("git.remoteAdd.name")}</Label>
            <Input
              id="git-remote-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="origin"
              disabled={adding}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => useGitStore.getState().cancelAddRemote()}
              disabled={adding}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {adding ? t("git.remoteAdd.adding") : t("git.remoteAdd.add")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
