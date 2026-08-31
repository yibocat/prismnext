import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TerminalIcon } from "lucide-react";
import { shellDesktop } from "@/lib/desktop-api/shell";
import {
  listSshPickerHosts,
  matchSshHostInput,
  SSH_CONFIG_REVEAL_PATH,
} from "@/lib/remote/ssh-host-picker";
import { useRemoteStore } from "@/stores/remote-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { appMenuFontClass } from "@/components/ui/app-menu";
import { SETTINGS_FORM_INPUT } from "@/components/modules/settings/settings-tokens";

export function SshHostPickerDialog({
  open,
  onOpenChange,
  onSelectHost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectHost: (alias: string) => void;
}) {
  const { t } = useTranslation();
  const hosts = useRemoteStore((s) => s.hosts);
  const byProfileId = useRemoteStore((s) => s.byProfileId);
  const hydrate = useRemoteStore((s) => s.hydrate);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) void hydrate();
    else setQuery("");
  }, [hydrate, open]);

  const recentIds = useMemo(() => Object.keys(byProfileId), [byProfileId]);
  const listed = useMemo(
    () => listSshPickerHosts(hosts, recentIds, query),
    [hosts, query, recentIds],
  );

  const select = (alias: string) => {
    onSelectHost(alias);
    onOpenChange(false);
  };

  const submit = () => {
    const match = matchSshHostInput(query, hosts);
    if ("alias" in match) {
      select(match.alias);
      return;
    }
    toast.error(t("remote.sshHostUnknown"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("remote.sshPickerTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("remote.sshHostnamePlaceholder")}
            aria-label={t("remote.sshHostnamePlaceholder")}
            className={cn(
              SETTINGS_FORM_INPUT,
              "w-full rounded-md border border-border bg-background px-2.5 font-sans",
              "placeholder:text-muted-foreground/40",
            )}
            autoFocus
          />
          <div className="max-h-56 min-h-0 overflow-y-auto">
            {listed.length === 0 ? (
              <p className={cn("px-1 py-2 text-muted-foreground", appMenuFontClass)}>
                {t("nav.workbench.noSshHosts")}
              </p>
            ) : (
              listed.map((host) => (
                <button
                  key={host.alias}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-accent",
                    appMenuFontClass,
                  )}
                  onClick={() => select(host.alias)}
                >
                  <TerminalIcon className="size-3.5 shrink-0 opacity-70" />
                  <span className="min-w-0 flex-1 truncate">{host.alias}</span>
                  {host.hostname !== host.alias ? (
                    <span className="shrink-0 text-[length:var(--font-dialog-label)] text-muted-foreground tabular-nums">
                      {host.hostname}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </form>
        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              void shellDesktop.shellShowItemInFolder(SSH_CONFIG_REVEAL_PATH);
            }}
          >
            {t("remote.openSshConfig")}
          </Button>
          <Button type="button" size="xs" onClick={submit}>
            {t("remote.connect")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
