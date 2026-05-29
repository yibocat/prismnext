import { useCallback } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { AGENT_UI_CONFIGS, type AgentSetting } from "@/lib/agent-config";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, CheckIcon } from "lucide-react";

// ─── Model / Select section ───

function SelectSection({ setting }: { setting: AgentSetting }) {
  const selectedModel = useClaudeChatStore((s) => s.selectedModel);
  const agentMode = useClaudeChatStore((s) => s.agentMode);
  const effortLevel = useClaudeChatStore((s) => s.effortLevel);
  const rawValue = setting.key === "model" ? selectedModel : setting.key === "agentMode" ? agentMode : null;

  const setValue = useCallback(
    (v: string | null) => {
      const st = useClaudeChatStore.getState();
      if (setting.key === "model") st.setSelectedModel(v as "sonnet" | "opus" | "haiku" | null);
      else if (setting.key === "agentMode") st.setAgentMode(v as "edit-before-ask" | "auto-edit" | "plan");
    },
    [setting.key],
  );

  return (
    <div>
      <div className="px-2 py-1 font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">{setting.label}</div>
      {setting.options?.map((opt) => (
        <DropdownMenuItem
          key={opt.id ?? "default"}
          onSelect={(e) => e.preventDefault()}
          onClick={() => setValue(opt.id)}
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[length:var(--font-chat-meta)]">{opt.name}</div>
            {opt.desc && (
              <div className="truncate text-muted-foreground text-[length:var(--font-chat-meta)]">{opt.desc}</div>
            )}
          </div>
          {rawValue === opt.id && <CheckIcon className="size-3 shrink-0" />}
        </DropdownMenuItem>
      ))}
    </div>
  );
}

// ─── Effort section ───

function EffortSection({ setting }: { setting: AgentSetting }) {
  const effortLevel = useClaudeChatStore((s) => s.effortLevel);
  const setEffortLevel = useClaudeChatStore((s) => s.setEffortLevel);
  const levels = setting.levels || [];

  return (
    <div className="px-2 py-1.5">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">{setting.label}</span>
        <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">
          {effortLevel === "low" ? "Low" : effortLevel === "medium" ? "Medium" : "High"}
        </span>
      </div>
      <div className="flex gap-1">
        {levels.map((level) => (
          <button
            key={level}
            className={cn(
              "flex-1 rounded-md py-1 text-center font-medium text-[length:var(--font-chat-meta)] transition-colors",
              effortLevel === level ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
            onClick={(e) => { e.stopPropagation(); setEffortLevel(level as "low" | "medium" | "high"); }}
          >
            {level === "low" ? "L" : level === "medium" ? "M" : "H"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Agent Settings Bar ───

export function AgentSettingsBar() {
  const selectedAgent = useClaudeChatStore((s) => s.selectedAgent);
  const config = AGENT_UI_CONFIGS[selectedAgent] || AGENT_UI_CONFIGS.claude;

  if (!config || config.settings.length === 0) return null;

  const selectedModel = useClaudeChatStore((s) => s.selectedModel);
  const agentMode = useClaudeChatStore((s) => s.agentMode);
  const effortLevel = useClaudeChatStore((s) => s.effortLevel);

  const modelLabel =
    selectedModel === "sonnet" ? "Sonnet"
    : selectedModel === "opus" ? "Opus"
    : selectedModel === "haiku" ? "Haiku"
    : "Default";
  const modeLabel =
    agentMode === "auto-edit" ? "Auto edit"
    : agentMode === "plan" ? "Plan mode"
    : "Edit before ask";
  const effortLabel = effortLevel === "low" ? "L" : effortLevel === "medium" ? "M" : "H";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-1 text-muted-foreground text-[length:var(--font-chat-meta)] transition-colors hover:bg-muted hover:text-foreground"
        >
          <span>{modelLabel}</span>
          <span className="text-muted-foreground/40 mx-0.5">·</span>
          <span>{modeLabel}</span>
          <span className="text-muted-foreground/40 mx-0.5">·</span>
          <span>{effortLabel}</span>
          <ChevronDownIcon className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {config.settings.map((setting, i) => (
          <div key={setting.key}>
            {i > 0 && <DropdownMenuSeparator />}
            {setting.type === "effort" ? (
              <EffortSection setting={setting} />
            ) : (
              <SelectSection setting={setting} />
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
