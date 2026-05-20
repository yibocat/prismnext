import { MessageSquareIcon } from "lucide-react";

export function LeftMainArea() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
        <MessageSquareIcon className="size-8 text-muted-foreground" />
      </div>
      <div className="text-center px-4">
        <h2 className="text-lg font-semibold text-foreground">AI Chat</h2>
        <p className="mt-1 text-[13px] text-muted-foreground max-w-sm">
          Start a conversation with your research assistant.
        </p>
      </div>
    </div>
  );
}
