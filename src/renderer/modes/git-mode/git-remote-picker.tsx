import { useTranslation } from "react-i18next";
import { formatRemoteUrlSummary } from "@shared/git";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGitStore } from "@/stores/git-store";

export function GitRemotePicker({ projectRoot }: { projectRoot: string }) {
  const { t } = useTranslation();
  const open = useGitStore((s) => s.pendingRemotePick);
  const remotes = useGitStore((s) => s.remotes);
  const syncing = useGitStore((s) => s.syncing);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) useGitStore.getState().cancelRemotePick();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("git.remotePicker.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground text-center">
          {t("git.remotePicker.body")}
        </p>
        <div className="flex flex-col gap-1.5">
          {remotes.map((remote) => (
            <Button
              key={remote.name}
              variant="outline"
              size="sm"
              className="h-auto justify-start px-2.5 py-1.5"
              disabled={Boolean(syncing)}
              onClick={() => {
                void useGitStore.getState().pushRemote(projectRoot, { remote: remote.name });
              }}
            >
              <span className="flex min-w-0 flex-col items-start text-left">
                <span className="font-medium">{remote.name}</span>
                {remote.url ? (
                  <span className="truncate text-[length:var(--font-menu-item)] text-muted-foreground">
                    {formatRemoteUrlSummary(remote.url)}
                  </span>
                ) : null}
              </span>
            </Button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => useGitStore.getState().cancelRemotePick()}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
