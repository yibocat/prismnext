import { memo, useState, useCallback } from "react";
import { MessagePrimitive } from "@assistant-ui/react";
import { CopyIcon, CheckIcon } from "lucide-react";

// ─── Copy Button ───

const CopyButton = memo(({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
      title="Copy"
    >
      {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
    </button>
  );
});
CopyButton.displayName = "CopyButton";

// ─── User Message ───

export function UserMessage() {
  return (
    <MessagePrimitive.Root className="group flex flex-col items-end py-2 px-4 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="flex items-end gap-1.5 max-w-[85%]">
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <MessagePrimitive.Parts>
            {({ part }) => {
              if (part.type === "text") {
                return <CopyButton text={part.text} />;
              }
              return null;
            }}
          </MessagePrimitive.Parts>
        </div>
        <div className="rounded-2xl bg-muted px-4 py-2 text-foreground text-sm leading-relaxed">
          <MessagePrimitive.Parts />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
