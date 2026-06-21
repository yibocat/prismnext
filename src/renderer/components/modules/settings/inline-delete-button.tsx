import type { MouseEvent } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InlineDeleteButtonProps {
  itemId: string;
  pending: boolean;
  disabled?: boolean;
  onRequest: () => void;
  onConfirm: () => void;
  variant?: "icon" | "text";
  requestLabel?: string;
  className?: string;
  stopPropagation?: boolean;
}

export function InlineDeleteButton({
  itemId,
  pending,
  disabled,
  onRequest,
  onConfirm,
  variant = "icon",
  requestLabel = "Remove",
  className,
  stopPropagation = false,
}: InlineDeleteButtonProps) {
  const wrapClick = (handler: () => void) => (event: MouseEvent) => {
    if (stopPropagation) event.stopPropagation();
    handler();
  };

  if (pending) {
    return (
      <Button
        variant="destructive"
        size="xs"
        className={cn("shrink-0", className)}
        data-inline-delete-confirm={itemId}
        disabled={disabled}
        onClick={wrapClick(onConfirm)}
      >
        Confirm
      </Button>
    );
  }

  if (variant === "text") {
    return (
      <Button
        variant="ghost"
        size="xs"
        className={cn("shrink-0 text-muted-foreground hover:text-destructive", className)}
        disabled={disabled}
        onClick={wrapClick(onRequest)}
      >
        {requestLabel}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className={cn("shrink-0 text-muted-foreground hover:text-destructive", className)}
      disabled={disabled}
      onClick={wrapClick(onRequest)}
    >
      <Trash2Icon className="size-3" />
    </Button>
  );
}
