import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatStore, type ChatExecutionMode } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import { BotIcon, CheckIcon, ChevronDownIcon, UsersIcon } from "lucide-react";

const MODES: Array<{
  value: ChatExecutionMode;
  label: string;
  description: string;
  icon: typeof BotIcon;
}> = [
  {
    value: "agent",
    label: "Agent",
    description: "Single agent — pick model and reasoning depth",
    icon: BotIcon,
  },
  {
    value: "expert-team",
    label: "Expert team",
    description: "@ experts to collaborate — model per expert preset",
    icon: UsersIcon,
  },
];

interface ChatModeSelectProps {
  compact?: boolean;
}

export function ChatModeSelect({ compact }: ChatModeSelectProps) {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const chatMode = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.chatMode ?? "agent",
  );
  const setChatMode = useChatStore((s) => s.setChatMode);

  const current = MODES.find((m) => m.value === chatMode) ?? MODES[0];
  const Icon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            compact ? "size-7 justify-center px-0 max-w-none" : "max-w-32",
          )}
          title={`Mode: ${current.label}`}
        >
          <Icon className="size-3.5 shrink-0" />
          {!compact && (
            <>
              <span className="truncate">{current.label}</span>
              <ChevronDownIcon className="size-3 shrink-0" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <div className="px-2 py-1 font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">
          Chat mode
        </div>
        {MODES.map((mode) => {
          const ModeIcon = mode.icon;
          return (
            <DropdownMenuItem
              key={mode.value}
              onClick={() => setChatMode(activeTabId, mode.value)}
            >
              <ModeIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[length:var(--font-chat-meta)]">{mode.label}</span>
                <span className="text-[length:var(--font-size-11)] text-muted-foreground/70 leading-snug">
                  {mode.description}
                </span>
              </div>
              {chatMode === mode.value && <CheckIcon className="size-3 shrink-0 ml-1" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
