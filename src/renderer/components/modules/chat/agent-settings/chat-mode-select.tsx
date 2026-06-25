import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuItem,
  AppMenuLabel,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { useChatStore, type ChatExecutionMode } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import { BotIcon, ChevronDownIcon, UsersIcon } from "lucide-react";

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
    <AppMenu>
      <AppMenuTrigger asChild>
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
      </AppMenuTrigger>
      <AppMenuContent align="start" className="w-60">
        <AppMenuLabel>Chat mode</AppMenuLabel>
        {MODES.map((mode) => (
          <AppMenuCheckItem
            key={mode.value}
            selected={chatMode === mode.value}
            description={mode.description}
            onClick={() => setChatMode(activeTabId, mode.value)}
          >
            {mode.label}
          </AppMenuCheckItem>
        ))}
      </AppMenuContent>
    </AppMenu>
  );
}
