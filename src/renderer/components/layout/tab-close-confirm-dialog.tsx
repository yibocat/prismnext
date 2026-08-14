import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTabCloseConfirmStore } from "@/stores/tab-close-confirm-store";
import { useTranslation } from "react-i18next";

export function TabCloseConfirmDialog() {
  const { t } = useTranslation();
  const pending = useTabCloseConfirmStore((s) => s.pending);
  const confirm = useTabCloseConfirmStore((s) => s.confirm);
  const secondary = useTabCloseConfirmStore((s) => s.secondary);
  const cancel = useTabCloseConfirmStore((s) => s.cancel);

  return (
    <Dialog
      open={pending != null}
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pending?.title ?? t("dialogs.tabClose.closeTab")}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <p className="text-sm">{pending?.description}</p>
              {pending?.detail ? (
                <p className="text-sm text-muted-foreground">{pending.detail}</p>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={cancel}>
            {t("common.cancel")}
          </Button>
          {pending?.secondaryLabel ? (
            <Button variant="destructive" onClick={secondary}>
              {pending.secondaryLabel}
            </Button>
          ) : null}
          <Button
            variant={pending?.destructive && !pending?.secondaryLabel ? "destructive" : "default"}
            onClick={confirm}
          >
            {pending?.confirmLabel ?? t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
