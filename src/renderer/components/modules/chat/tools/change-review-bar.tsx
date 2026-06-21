import { CheckIcon, XIcon } from "lucide-react";

export interface ChangeReviewBarProps {
  label?: string;
  onAccept: () => void;
  onReject: () => void;
  resolving?: boolean;
}

export function ChangeReviewBar({
  label = "Review change",
  onAccept,
  onReject,
  resolving = false,
}: ChangeReviewBarProps) {
  return (
    <div className="flex items-center gap-2 border-t border-border mt-2 pt-2">
      <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">
        {label}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[length:var(--font-badge)] font-medium text-success hover:bg-success/10 dark:hover:bg-success/20 transition-colors disabled:opacity-50"
        onClick={onAccept}
        disabled={resolving}
      >
        <CheckIcon className="size-3" />
        Accept
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[length:var(--font-badge)] font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        onClick={onReject}
        disabled={resolving}
      >
        <XIcon className="size-3" />
        Reject
      </button>
    </div>
  );
}
