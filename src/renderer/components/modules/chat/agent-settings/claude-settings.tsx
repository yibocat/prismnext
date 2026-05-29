import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAgentSettingsStore } from "@/stores/agent-settings-store";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";

interface SettingOption {
  id: string | null;
  name: string;
  desc?: string;
}

const MODEL_OPTIONS: SettingOption[] = [
  { id: null, name: "Default", desc: "Use system Claude Code setting" },
  { id: "sonnet", name: "Sonnet", desc: "Fast, efficient for most tasks" },
  { id: "opus", name: "Opus", desc: "Most capable, complex reasoning" },
  { id: "haiku", name: "Haiku", desc: "Fastest, simple tasks" },
];

const MODE_OPTIONS: SettingOption[] = [
  { id: "edit-before-ask", name: "Edit before ask" },
  { id: "auto-edit", name: "Auto edit" },
  { id: "plan", name: "Plan mode" },
];

const EFFORT_LEVELS = ["low", "medium", "high"] as const;

function SelectSection({
  label,
  options,
  settingKey,
}: {
  label: string;
  options: SettingOption[];
  settingKey: string;
}) {
  const rawValue = useAgentSettingsStore((s) => s.settings[settingKey]);
  const setSetting = useAgentSettingsStore((s) => s.setSetting);

  return (
    <div>
      <div className="px-2 py-1 font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">
        {label}
      </div>
      {options.map((opt) => (
        <DropdownMenuItem
          key={opt.id ?? "default"}
          onSelect={(e) => e.preventDefault()}
          onClick={() => setSetting(settingKey, opt.id)}
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

function EffortSection() {
  const effortLevel = useAgentSettingsStore((s) => s.settings["effort"]) ?? "medium";
  const setSetting = useAgentSettingsStore((s) => s.setSetting);

  return (
    <div className="px-2 py-1.5">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">Effort</span>
        <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">
          {effortLevel === "low" ? "Low" : effortLevel === "medium" ? "Medium" : "High"}
        </span>
      </div>
      <div className="flex gap-1">
        {EFFORT_LEVELS.map((level) => (
          <button
            key={level}
            className={cn(
              "flex-1 rounded-md py-1 text-center font-medium text-[length:var(--font-chat-meta)] transition-colors",
              effortLevel === level
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
            onClick={(e) => { e.stopPropagation(); setSetting("effort", level); }}
          >
            {level === "low" ? "L" : level === "medium" ? "M" : "H"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ClaudeSettingsContent() {
  return (
    <>
      <SelectSection label="Model" options={MODEL_OPTIONS} settingKey="model" />
      <DropdownMenuSeparator />
      <SelectSection label="Mode" options={MODE_OPTIONS} settingKey="agentMode" />
      <DropdownMenuSeparator />
      <EffortSection />
    </>
  );
}

export function ClaudeSettingsLabel() {
  const settings = useAgentSettingsStore((s) => s.settings);
  const model = settings["model"];
  const mode = settings["agentMode"];
  const effort = settings["effort"] ?? "medium";

  const modelLabel =
    model === "sonnet" ? "Sonnet" : model === "opus" ? "Opus" : model === "haiku" ? "Haiku" : "Default";
  const modeLabel =
    mode === "auto-edit" ? "Auto edit" : mode === "plan" ? "Plan mode" : "Edit before ask";
  const effortLabel = effort === "low" ? "L" : effort === "high" ? "H" : "M";

  return (
    <span>
      {modelLabel}
      <span className="text-muted-foreground/40 mx-0.5">·</span>
      {modeLabel}
      <span className="text-muted-foreground/40 mx-0.5">·</span>
      {effortLabel}
    </span>
  );
}
