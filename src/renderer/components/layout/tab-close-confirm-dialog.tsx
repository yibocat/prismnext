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

export function TabCloseConfirmDialog() {
  const pending = useTabCloseConfirmStore((s) => s.pending);
  const confirm = useTabCloseConfirmStore((s) => s.confirm);
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
          <DialogTitle>{pending?.title ?? "Close Tab"}</DialogTitle>
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
            Cancel
          </Button>
          <Button
            variant={pending?.destructive ? "destructive" : "default"}
            onClick={confirm}
          >
            {pending?.confirmLabel ?? "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
